"""
HLTV 数据同步脚本 — 爬取 UR 战队比赛数据，写入 ur_esports.db
用法: python sync_hltv.py
输出: JSON 格式同步结果（最后一行）
"""
import json, sys, os, sqlite3, re
from datetime import datetime

# 数据库路径
DB_PATH = os.environ.get('DB_PATH', os.path.join(os.path.dirname(__file__), '..', 'data', 'ur_esports.db'))
DB_PATH = os.path.abspath(DB_PATH)

# 选手匹配表：HLTV alternateName → players.nickname
PLAYER_ALIAS_MAP = {
    '0z': '0z',
    'Doomer': 'Doomer',
    '4ever': '4ever',
    'drace': 'drace',
    'gLong': 'gLong',
}

# 选手黑名单（离队/非选手，跳过 stats 写入）
SKIP_STATS_NICKS = {'yoi', 'Afufu', 'madness', 'Tw1nk1e17', 'z1ayr', 'reason', 'M1racle',
                    'xiaoxizi', 'Miami', 'Risk', 'expSasiKi', 'SPine', 'rage'}

# ========================
# 1. 爬取 HLTV 数据
# ========================

def fetch_hlvtv_matches():
    """爬取 UR 战队页面，返回比赛列表和选手信息"""
    from scrapling.fetchers import StealthyFetcher
    StealthyFetcher.adaptive = True

    print("[1/3] 爬取 UR 战队页面...", flush=True)
    page = StealthyFetcher.fetch(
        'https://www.hltv.org/team/13116/ur',
        headless=True, timeout=60000
    )
    print(f"      Status: {page.status} | HTML: {len(page.html_content)} 字符", flush=True)

    html = page.html_content

    # 解析 JSON-LD
    ld_raw = page.css('script[type="application/ld+json"]::text').get()
    athletes = []
    coach = None
    if ld_raw:
        ld = json.loads(ld_raw)
        athletes = ld.get('athlete', [])
        coach = ld.get('coach', {})

    # 选手信息：JSON-LD + HTML 图片交叉
    players_ld = {a['alternateName']: {
        'name': a['name'], 'nick': a['alternateName'],
        'url': a['url'], 'player_id': a['url'].split('/')[-2] if a.get('url') else '',
        'nationality': a.get('nationality', ''),
    } for a in athletes}

    # HTML 选手图片（含 inactive 选手如 gLong）
    imgs = page.css('.player-picture-pic')
    seen_nicks = set(players_ld.keys())
    for img in imgs:
        title = img.attrib.get('title', '')
        m = re.search(r"'([^']+)'", title)
        nick = m.group(1) if m else ''
        if nick and nick not in seen_nicks:
            seen_nicks.add(nick)
            players_ld[nick] = {
                'name': title.split("'")[0].strip() if "'" in title else title,
                'nick': nick, 'url': '', 'player_id': '', 'nationality': ''
            }

    # 比赛链接
    match_links_raw = page.css('a[href*="/matches/"]::attr(href)').getall()
    seen_matches = set()
    matches = []
    for href in match_links_raw:
        m = re.search(r'/matches/(\d+)/(.+)', href)
        if m and m.group(1) not in seen_matches:
            seen_matches.add(m.group(1))
            matches.append({'id': m.group(1), 'slug': m.group(2)})

    print(f"      选手: {len(players_ld)}人 | 教练: {coach.get('name','')} | 比赛: {len(matches)}场", flush=True)

    return {
        'players': players_ld,
        'coach': coach,
        'matches': matches,
    }


def fetch_match_detail(match_id):
    """爬取单场比赛的选手统计数据"""
    from scrapling.fetchers import StealthyFetcher
    StealthyFetcher.adaptive = True

    url = f'https://www.hltv.org/matches/{match_id}/ur-placeholder'
    try:
        page = StealthyFetcher.fetch(url, headless=True, timeout=60000)
    except Exception as e:
        print(f"      ⚠ 比赛 {match_id} 爬取失败: {e}", flush=True)
        return None

    html = page.html_content

    # 提取比分和基本信息
    teams = page.css('.team .teamName::text').getall()
    scores = page.css('.team .teamScore::text').getall()
    date_el = page.css('.date::text').get()
    event_el = page.css('.event a::text').get()
    bo_el = page.css('.veto-box span::text').get()

    if len(teams) < 2 or len(scores) < 2:
        return None

    # 判断哪边是 UR
    ur_side_idx = None
    opp_side_idx = None
    for i, t in enumerate(teams):
        if t.strip().lower() in ('ur', 'unsettled resentment'):
            ur_side_idx = i
            opp_side_idx = 1 - i
            break

    if ur_side_idx is None:
        return None

    match_info = {
        'match_id': match_id,
        'date': date_el.strip() if date_el else '',
        'event': event_el.strip() if event_el else '',
        'opponent': teams[opp_side_idx].strip() if opp_side_idx is not None else '',
        'our_score': int(scores[ur_side_idx].strip()) if ur_side_idx is not None else 0,
        'their_score': int(scores[opp_side_idx].strip()) if opp_side_idx is not None else 0,
        'bo': bo_el.strip() if bo_el else '',
    }

    # 提取地图数据
    map_els = page.css('.mapholder')
    maps = []
    for m_el in map_els:
        map_name = m_el.css('.mapname::text').get()
        map_scores = m_el.css('.results-left .results-team-score::text, .results-right .results-team-score::text').getall()
        if map_name and len(map_scores) >= 2:
            maps.append({
                'map_name': map_name.strip(),
                'our_score': int(map_scores[0].strip()),
                'their_score': int(map_scores[1].strip()),
            })

    if not maps:
        return None

    match_info['maps'] = maps
    return match_info


def fetch_all_matches(match_list, max_matches=10):
    """爬取多场比赛详情"""
    results = []
    for i, m in enumerate(match_list[:max_matches]):
        print(f"[2/3] 爬取比赛 {i+1}/{min(len(match_list), max_matches)}: {m['id']} ...", flush=True)
        detail = fetch_match_detail(m['id'])
        if detail:
            results.append(detail)
            print(f"      {detail['date']} vs {detail['opponent']} ({len(detail['maps'])} maps)", flush=True)
        else:
            print(f"      ⚠ 跳过（无数据或非UR比赛）", flush=True)
    return results


# ========================
# 2. 写入数据库
# ========================

def sync_to_db(hlvtv_data, match_details, db_path):
    """将 HLTV 数据写入 SQLite"""
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    cur = conn.cursor()

    stats = {'players_updated': 0, 'matches_inserted': 0, 'matches_updated': 0, 'stats_written': 0}

    # 2.1 更新选手 hltv_url
    for nick, info in hlvtv_data['players'].items():
        db_nick = PLAYER_ALIAS_MAP.get(nick)
        if not db_nick:
            continue
        hltv_url = info.get('url', '')
        if hltv_url:
            cur.execute(
                "UPDATE players SET hltv_url = ? WHERE nickname = ? AND division = 'cs2' AND (hltv_url IS NULL OR hltv_url = '')",
                [hltv_url, db_nick]
            )
            if cur.rowcount > 0:
                stats['players_updated'] += 1

    # 2.2 写入比赛数据（UPSERT: 日期+对手+地图 唯一）
    for m in match_details:
        if not m.get('maps'):
            continue

        for mp in m['maps']:
            # 检查是否已存在
            cur.execute(
                "SELECT id FROM matches WHERE match_date = ? AND opponent = ? AND map_name = ? AND match_type = 'official'",
                [m['date'], m['opponent'], mp['map_name']]
            )
            existing = cur.fetchone()

            if existing:
                cur.execute(
                    "UPDATE matches SET our_score = ?, their_score = ?, event_name = ?, bo_format = ? WHERE id = ?",
                    [mp['our_score'], mp['their_score'], m['event'], m['bo'], existing[0]]
                )
                match_id = existing[0]
                stats['matches_updated'] += 1
            else:
                cur.execute(
                    """INSERT INTO matches (match_date, opponent, map_name, our_score, their_score, 
                       match_type, event_name, bo_format, division)
                       VALUES (?, ?, ?, ?, ?, 'official', ?, ?, 'cs2')""",
                    [m['date'], m['opponent'], mp['map_name'], mp['our_score'], mp['their_score'],
                     m['event'], m['bo']]
                )
                match_id = cur.lastrowid
                stats['matches_inserted'] += 1

            # 2.3 暂不写选手统计（需要逐场爬取 stats 页面，下一步扩展）
            # stats 页面: /matches/{match_id}/stats

    conn.commit()
    conn.close()
    return stats


# ========================
# 主流程
# ========================

def main():
    print("=" * 50, flush=True)
    print("UR HLTV 数据同步", flush=True)
    print("=" * 50, flush=True)

    try:
        # 1. 爬取 UR 战队页
        hlvtv_data = fetch_hlvtv_matches()

        # 2. 爬取比赛详情（最多10场）
        match_details = fetch_all_matches(hlvtv_data['matches'], max_matches=10)

        # 3. 写入数据库
        print(f"\n[3/3] 写入数据库: {DB_PATH}", flush=True)
        stats = sync_to_db(hlvtv_data, match_details, DB_PATH)

        result = {
            'success': True,
            'players_found': len(hlvtv_data['players']),
            'matches_scraped': len(match_details),
            'matches_total_hlvtv': len(hlvtv_data['matches']),
            **stats,
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        }

        print(f"\n✅ 同步完成:", flush=True)
        for k, v in result.items():
            if k != 'success':
                print(f"   {k}: {v}", flush=True)

        # 输出 JSON 结果（最后一行，供后端读取）
        print(json.dumps(result, ensure_ascii=False))

    except Exception as e:
        print(f"\n❌ 同步失败: {e}", flush=True)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
