/**
 * UR Esports 战术本 → Word 一键导出
 * 数据源: backend/data/ur_esports.db 的 tactics_v2 表(is_active=1)
 * 排版: 地图(H1,页首) → 角色方(H2) → 回合类型(H3: 手枪局/强起局/半起局/长枪局) → 战术块(不跨页)
 * 输出: ../../战术本导出/UR战术本_YYYY-MM-DD.docx
 */
const path = require('path');
const fs = require('fs');
const Database = require(path.join(__dirname, '..', '..', 'backend', 'node_modules', 'better-sqlite3'));
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, TableOfContents,
  AlignmentType, LevelFormat, BorderStyle, PageBreak,
} = require('docx');

// 所有文字段默认关闭拼写/语法检查(noProof),选手ID等英文不再显示波浪线
const T = (opts) => new TextRun({ noProof: true, ...opts });

const YAHEI = { ascii: 'Microsoft YaHei', eastAsia: 'Microsoft YaHei', hAnsi: 'Microsoft YaHei' };
const LINE_150 = { line: 360 }; // 240 = 单倍行距, 360 = 1.5 倍

// 地图顺序与专属色
const MAP_ORDER = ['Mirage', 'Dust2', 'Anubis', 'Ancient', 'Overpass', 'Nuke', 'Inferno', 'Vertigo', 'Train'];
const MAP_COLORS = {
  Mirage: 'E67E22',   // 沙城橙
  Dust2: 'B7950B',    // 尘土金
  Anubis: '148F77',   // 尼罗青绿
  Ancient: '1E8449',  // 丛林绿
  Overpass: '2E86C1', // 水渠蓝
  Nuke: '884EA0',     // 核厂紫
  Inferno: 'C0392B',  // 炼狱红
};
const FALLBACK_COLOR = '707B7C';

const SIDE_ORDER = ['T', 'CT'];
const SIDE_LABEL = { T: 'T 方（进攻）', CT: 'CT 方（防守）' };
const ROUND_ORDER = ['P', 'A', 'H', 'F', 'E'];
const ROUND_LABEL = { P: '手枪局', A: '强起局', H: '半起局', F: '长枪局', E: 'ECO 局' };

// ── 读数据 ──
const db = new Database(path.join(__dirname, '..', '..', 'backend', 'data', 'ur_esports.db'), { readonly: true });
const rows = db.prepare('SELECT * FROM tactics_v2 WHERE is_active = 1 ORDER BY sort_order, tactic_id').all();
db.close();

const maps = [...new Set(rows.map(r => r.map_name))];
maps.sort((a, b) => {
  const ia = MAP_ORDER.indexOf(a), ib = MAP_ORDER.indexOf(b);
  return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
});

function parseSteps(raw) {
  try { const v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v.filter(s => String(s).trim()) : []; }
  catch { return raw ? [String(raw)] : []; }
}

// ── 组装文档 ──
const children = [];

// 封面标题
children.push(
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 2400, after: 300, ...LINE_150 },
    children: [T({ text: 'UR Esports 战术本', bold: true, size: 72, font: YAHEI, color: '1A2A56' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200, ...LINE_150 },
    children: [T({ text: `导出日期：${new Date().toISOString().slice(0, 10)}`, size: 24, font: YAHEI, color: '555555' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 0, ...LINE_150 },
    children: [T({ text: `共 ${maps.length} 张地图 · ${rows.length} 套战术`, size: 24, font: YAHEI, color: '555555' })],
  }),
  new Paragraph({ children: [new PageBreak()] }),
  // 目录（打开文档后按提示更新域，或全选后 F9）
  new Paragraph({
    spacing: { after: 200, ...LINE_150 },
    children: [T({ text: '目录', bold: true, size: 36, font: YAHEI })],
  }),
  new TableOfContents('目录', { hyperlink: true, headingStyleRange: '1-3' }),
);

let numInstance = 0; // 每套战术独立编号实例,步骤从 1 重新计数

maps.forEach((mapName, mi) => {
  const color = MAP_COLORS[mapName] || FALLBACK_COLOR;
  const mapRows = rows.filter(r => r.map_name === mapName);

  // 地图大标题:每张图另起一页(第一张图接在目录后也另起)
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    pageBreakBefore: true,
    spacing: { before: 0, after: 240, ...LINE_150 },
    children: [T({ text: `${mapName}（${mapRows.length} 套战术）`, bold: true, size: 44, font: YAHEI, color })],
  }));

  SIDE_ORDER.forEach(side => {
    const sideRows = mapRows.filter(r => r.team_side === side);
    if (!sideRows.length) return;
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 160, ...LINE_150 },
      children: [T({ text: SIDE_LABEL[side] || side, bold: true, size: 32, font: YAHEI, color: '1A2A56' })],
    }));

    ROUND_ORDER.forEach(round => {
      const list = sideRows.filter(r => r.round_type === round);
      if (!list.length) return;
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 200, after: 120, ...LINE_150 },
        children: [T({ text: `${ROUND_LABEL[round] || round}（${list.length}）`, bold: true, size: 28, font: YAHEI, color: '333333' })],
      }));

      list.forEach(t => {
        numInstance += 1;
        const steps = parseSteps(t.steps);
        const nameBits = [`◈ ${t.name}`];
        if (t.target_area) nameBits.push(`【${t.target_area}】`);
        if (t.alias) nameBits.push(`（别名：${t.alias}）`);

        // 战术名行:keepNext 粘住后续步骤;整块 keepLines 防跨页拆散
        children.push(new Paragraph({
          keepNext: true, keepLines: true,
          spacing: { before: 160, after: 60, ...LINE_150 },
          children: [
            T({ text: nameBits.join(' '), bold: true, size: 24, font: YAHEI, color }),
            T({ text: `　${t.tactic_id}`, size: 18, font: YAHEI, color: '999999' }),
          ],
        }));

        steps.forEach((s, si) => {
          children.push(new Paragraph({
            keepLines: true,
            keepNext: si < steps.length - 1 || !!t.notes, // 中间步骤都粘住下一段
            numbering: { reference: 'tactic-steps', level: 0, instance: numInstance },
            spacing: { after: 40, ...LINE_150 },
            children: [T({ text: String(s), size: 22, font: YAHEI, color: '222222' })],
          }));
        });
        if (!steps.length) {
          children.push(new Paragraph({
            keepLines: true, keepNext: !!t.notes,
            spacing: { after: 40, ...LINE_150 },
            children: [T({ text: '（暂无步骤记录）', italics: true, size: 22, font: YAHEI, color: '999999' })],
          }));
        }
        if (t.notes) {
          children.push(new Paragraph({
            keepLines: true,
            spacing: { after: 60, ...LINE_150 },
            children: [T({ text: `备注：${t.notes}`, italics: true, size: 22, font: YAHEI, color: '8A6A1F' })],
          }));
        }
      });
    });
  });

  // 地图结尾分割线(用地图色的下边框段落)
  children.push(new Paragraph({
    spacing: { before: 240, after: 0 },
    border: { bottom: { style: BorderStyle.DOUBLE, size: 18, color } },
    children: [T({ text: '' })],
  }));
});

const doc = new Document({
  creator: 'UR Esports 赛训系统',
  title: 'UR Esports 战术本',
  styles: {
    default: {
      document: { run: { font: YAHEI, size: 22 }, paragraph: { spacing: LINE_150 } },
      // 显式声明大纲级别:目录域(TOC \o "1-3")按 outlineLvl 收集条目,
      // docx 库默认的 Heading 样式缺这个字段,WPS/Word 更新目录会报"未找到目录项"
      heading1: { run: { font: YAHEI, bold: true }, paragraph: { outlineLevel: 0, spacing: LINE_150 } },
      heading2: { run: { font: YAHEI, bold: true }, paragraph: { outlineLevel: 1, spacing: LINE_150 } },
      heading3: { run: { font: YAHEI, bold: true }, paragraph: { outlineLevel: 2, spacing: LINE_150 } },
    },
  },
  numbering: {
    config: [{
      reference: 'tactic-steps',
      levels: [{
        level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START,
        style: { paragraph: { indent: { left: 480, hanging: 300 } }, run: { font: YAHEI } },
      }],
    }],
  },
  features: { updateFields: true }, // 打开文档时自动提示更新目录域
  sections: [{
    properties: {},
    children,
  }],
});

const outDir = path.join(__dirname, '..', '..', '战术本导出');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `UR战术本_${new Date().toISOString().slice(0, 10)}.docx`);

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(outFile, buf);
  console.log('导出完成: ' + outFile);
  console.log(`地图 ${maps.length} 张 / 战术 ${rows.length} 套`);
});
