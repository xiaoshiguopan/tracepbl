export type SourceStatus = "available" | "conditional";

export type SourceRecord = {
  id: string;
  title: string;
  kind: string;
  institution: string;
  period: string;
  locator: string;
  url: string;
  discoveredBy: "已登记知识库" | "外部权威来源补充";
  status: SourceStatus;
  excerpt: string;
  excerptLabel: string;
  contextNote: string;
  reason: string;
  helps: string;
  cannotProve: string;
  rights: string;
  recommended: boolean;
};

export type SourceDiscoveryDraft = {
  selectedIds: string[];
  excludedIds: string[];
};

export const sourceFixture: SourceRecord[] = [
  {
    id: "AUTH-SRC-001",
    title: "《贞观政要》版本记录",
    kind: "政治文献",
    institution: "国家图书馆（国家古籍保护中心）",
    period: "明成化元年内府刻本",
    locator: "国家珍贵古籍名录 03832",
    url: "https://www.nlc.cn/pcab/zx/xw/20240805_2640651.shtml",
    discoveredBy: "已登记知识库",
    status: "conditional",
    excerpt: "米斗三钱，外户不闭",
    excerptLabel: "必要短引",
    contextNote: "此句位于该版本所载后世题辞，不是同期统计。",
    reason: "它能呈现后世如何概括“贞观之盛”，适合与器物、图像史料互证。",
    helps: "政治叙事如何塑造“盛世”标准。",
    cannotProve: "普通人的生活水平、全国经济数量或开元时期情况。",
    rights: "注明国家图书馆来源；本演示只保留必要短引，不复制书影或全文。",
    recommended: true,
  },
  {
    id: "AUTH-SRC-002",
    title: "三彩釉陶载乐骆驼",
    kind: "考古实物",
    institution: "中国国家博物馆",
    period: "唐 · 相关墓葬纪年 723 年",
    locator: "中国国家博物馆馆藏精品页",
    url: "https://www.chnmuseum.cn/zp/zpml/kgfjp/202008/t20200824_247230.shtml",
    discoveredBy: "已登记知识库",
    status: "conditional",
    excerpt: "骆驼昂首挺立，驮载了5个汉、胡成年男子。",
    excerptLabel: "馆方描述必要短引",
    contextNote: "馆方认为这一形象与长安百戏、胡乐及文化交流有关；器物来自墓葬语境。",
    reason: "它补入考古实物视角，可与政治文献对读盛世叙事中的文化交流。",
    helps: "唐代工艺、胡汉乐舞形象与精英墓葬中的交流表征。",
    cannotProve: "社会普遍富裕，或真实演出必然按器物比例发生。",
    rights: "馆藏图片许可未明确；本演示不复制或热链图片，只展示必要短引与定位。",
    recommended: true,
  },
  {
    id: "AUTH-SRC-004",
    title: "唐鎏金舞马衔杯纹皮囊式银壶",
    kind: "金银器",
    institution: "陕西历史博物馆",
    period: "唐 · 何家村窖藏",
    locator: "陕西历史博物馆藏品页",
    url: "https://www.sxhm.com/en/detail/469.html",
    discoveredBy: "外部权威来源补充",
    status: "conditional",
    excerpt: "壶身呈扁圆形，是模仿我国北方游牧民族契丹族使用的皮囊壶制作而成。",
    excerptLabel: "馆方描述必要短引",
    contextNote: "器物属于何家村窖藏，馆方从器形、工艺与舞马纹样解释其文化语境。",
    reason: "它提供工艺、宫廷宴乐与跨文化器形的实物线索，能扩大证据类型。",
    helps: "宫廷与精英物质生活、金银器工艺及文化交流。",
    cannotProve: "普通社会普遍富裕或唐朝前期全时段状况。",
    rights: "图片许可待核对；本演示只展示必要短引、事实性元数据和官方入口。",
    recommended: true,
  },
  {
    id: "AUTH-SRC-003",
    title: "阎立本步辇图卷",
    kind: "宫廷图像",
    institution: "故宫博物院",
    period: "唐 · 绢本设色",
    locator: "文物号 新00119106",
    url: "https://www.dpm.org.cn/collection/paint/234620.html",
    discoveredBy: "已登记知识库",
    status: "conditional",
    excerpt: "《步辇图》卷，唐，阎立本作，绢本，设色，纵38.5厘米，横129厘米。",
    excerptLabel: "馆方著录必要短引",
    contextNote: "馆方页面将其解释为唐太宗接见吐蕃使臣的宫廷历史画；作者、年代与流传仍应保留复核空间。",
    reason: "它加入宫廷图像的政治表达，可与文献和器物比较不同史料如何塑造叙事。",
    helps: "唐朝对外交往的宫廷表达、人物秩序与政治叙事。",
    cannotProve: "事件全部细节、普通社会生活或经济繁荣。",
    rights: "一般馆藏图开放许可未确认；本演示不复制图片，只展示著录短引与官方入口。",
    recommended: true,
  },
  ...[
    ["AUTH-SRC-005", "三彩方柜", "考古实物", "中国国家博物馆", "https://www.chnmuseum.cn/zp/zpml/kgfjp/202111/t20211116_252219.shtml", "工艺技术、随葬文化与精英生活物象。", "真实家具普及率、普通家庭生活或全国经济水平。"],
    ["AUTH-SRC-006", "银药盒", "金银器", "中国国家博物馆", "https://www.chnmuseum.cn/zp/zpml/kgfjp/202111/t20211116_252252.shtml", "宫廷与精英消费、医药观念和金银器工艺。", "普通社会医疗水平、财富分配或整个唐前期状况。"],
    ["AUTH-SRC-007", "跪坐奏乐陶俑（一组）", "考古实物", "中国国家博物馆", "https://www.chnmuseum.cn/zp/zpml/kgfjp/202111/t20211116_252264.shtml", "宫廷乐舞、乐器组合和墓葬文化表达。", "现实演出规模、普通人的娱乐生活或经济繁荣程度。"],
    ["AUTH-SRC-008", "红衣舞女壁画", "墓葬图像", "中国国家博物馆", "https://www.chnmuseum.cn/zp/zpml/kgfjp/202111/t20211116_252255.shtml", "乐舞形象、服饰与墓葬中的文化生活表达。", "全部阶层的日常生活。"],
    ["AUTH-SRC-009", "彩绘陶打马球女俑", "考古实物", "中国国家博物馆", "https://www.chnmuseum.cn/zp/zpml/kgfjp/202111/t20211116_252284.shtml", "女性活动形象、体育娱乐和精英墓葬表达。", "女性普遍社会地位、马球全民普及或全国生活水平。"],
    ["AUTH-SRC-010", "李白草书《上阳台帖》", "传世书迹", "故宫博物院", "https://www.dpm.org.cn/collection/handwriting/228280.html", "唐代传世书迹、书法与后世收藏流传。", "政治清明、经济繁荣或普通人生活。"],
  ].map(([id, title, kind, institution, url, helps, cannotProve]) => ({
    id,
    title,
    kind,
    institution,
    period: "唐",
    locator: "官方馆藏登记页",
    url,
    discoveredBy: (["AUTH-SRC-009", "AUTH-SRC-010"].includes(id) ? "外部权威来源补充" : "已登记知识库") as SourceRecord["discoveredBy"],
    status: "conditional" as const,
    excerpt: "本演示未复制馆藏图像或长篇馆方解说。请结合官方登记页查看原件与完整说明。",
    excerptLabel: "展示边界",
    contextNote: "当前只完成题名、机构、时代、类型和稳定链接登记；图片与长文再使用许可仍待逐条确认。",
    reason: `它可补充${helps}`,
    helps,
    cannotProve,
    rights: "图片许可未明确；只展示事实性元数据和官方入口。",
    recommended: false,
  })),
];

export const emptySourceDraft: SourceDiscoveryDraft = { selectedIds: [], excludedIds: [] };

export function toggleSourceSelection(draft: SourceDiscoveryDraft, sourceId: string): SourceDiscoveryDraft {
  const selected = draft.selectedIds.includes(sourceId);
  return {
    selectedIds: selected ? draft.selectedIds.filter((id) => id !== sourceId) : [...draft.selectedIds, sourceId],
    excludedIds: draft.excludedIds.filter((id) => id !== sourceId),
  };
}

export function excludeSource(draft: SourceDiscoveryDraft, sourceId: string): SourceDiscoveryDraft {
  return {
    selectedIds: draft.selectedIds.filter((id) => id !== sourceId),
    excludedIds: draft.excludedIds.includes(sourceId) ? draft.excludedIds.filter((id) => id !== sourceId) : [...draft.excludedIds, sourceId],
  };
}

export function getSourceSetSummary(draft: SourceDiscoveryDraft) {
  const selected = sourceFixture.filter((source) => draft.selectedIds.includes(source.id));
  const kinds = new Set(selected.map((source) => source.kind));
  return {
    selectedCount: selected.length,
    kindCount: kinds.size,
    ready: selected.length >= 4 && kinds.size >= 3,
    gap: selected.length < 4 ? `还需选择 ${4 - selected.length} 条` : kinds.size < 3 ? "还需补入不同类型" : "已形成多类型互证组合",
  };
}
