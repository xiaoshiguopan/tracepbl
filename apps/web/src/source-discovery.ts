export type SourceRecord = {
  id: string;
  title: string;
  nature: string;
  role: string;
  institution: string;
  period: string;
  locator: string;
  url: string;
  excerpt: string;
  contextNote: string;
  meaning: string;
  interpretation: string;
  limitation: string;
  rights: string;
  questionIds: number[];
  recommended: boolean;
  usable?: boolean;
  statusNote?: string;
};

export type OwnMaterial = { id: string; kind: "url" | "text"; name: string; content: string };
export type SourceDiscoveryDraft = { fixtureVersion: 2; selectedIds: string[]; batch: number; needs: string[]; customNeed: string; ownMaterials: OwnMaterial[] };

export const sourceFixture: SourceRecord[] = [
  {
    id: "SRC-TD-FINANCE", title: "《通典》所载唐前期财政与边军规模", nature: "原始文献", role: "背景条件", institution: "中国社会科学网公开研究引录", period: "唐代记载", locator: "《通典》卷六、卷一七二", url: "https://www.cssn.cn/lsx/lsx_zgs/202210/t20221024_5552516.shtml",
    excerpt: "“大凡镇兵四十九万人，戎马八万余匹。每岁经费：衣赐则千二十万匹段，军仓则百九十万石，大凡千二百十万。”《通典》另载，天下边军每年所费须申报度支，由中央核计。",
    contextNote: "杜佑生活于唐代中后期，《通典》保存了制度与财政记录；页面同时提供现代校勘本定位。",
    meaning: "材料说，唐朝边镇拥有约四十九万士兵、八万余匹军马；朝廷每年要供应大量布帛和粮食，相关开支由中央财政部门核算。",
    interpretation: "这条材料帮助学生看到盛世并非只有繁华景象，还依赖中央能够持续调度税收、粮食和庞大边军。",
    limitation: "制度规定和财政总量不能直接证明各地执行效果，也不能单独解释盛世全部成因。", rights: "只使用必要短引与公开页面定位。", questionIds: [1, 2], recommended: true,
  },
  {
    id: "SRC-DU-FU", title: "杜甫《忆昔》中的开元记忆", nature: "文学史料", role: "背景条件", institution: "维基文库公开古籍文本", period: "唐", locator: "《忆昔》第二首", url: "https://zh.wikisource.org/zh-hans/%E6%86%B6%E6%98%94_%28%E6%9D%9C%E7%94%AB%29",
    excerpt: "忆昔开元全盛日，小邑犹藏万家室。稻米流脂粟米白，公私仓廪俱丰实。九州道路无豺虎，远行不劳吉日出。齐纨鲁缟车班班，男耕女桑不相失。",
    contextNote: "诗作写于乱后，是诗人对开元时期的追忆，不是同期统计报告。",
    meaning: "杜甫回忆开元时期人口众多、粮食充足、仓库丰盈、道路安定，各地织物往来频繁，农业和蚕桑生产较为稳定。",
    interpretation: "它能呈现当时人如何回望盛世，也适合训练学生区分文学表达、历史记忆与可核验数量。",
    limitation: "不能据此断定全国所有地区、群体都同样富足。", rights: "古籍文本公开；保留作品、作者与篇目定位。", questionIds: [1], recommended: true,
  },
  {
    id: "SRC-TD-HOUSEHOLDS", title: "《通典》中的天宝户口记录", nature: "历史数据", role: "关键转折", institution: "公开古籍文本与点校本定位", period: "唐", locator: "《通典·食货典》户口", url: "https://zh.wikisource.org/wiki/%E9%80%9A%E5%85%B8",
    excerpt: "《通典》所录：天宝十三载户九百六十一万九千二百五十四；乾元三年见到帐一百六十九州，管户一百九十三万三千一百三十四，管口一千六百九十九万三百八十六。",
    contextNote: "户籍数字同时受战争死亡、人口逃散、土地失控和国家统计能力下降影响。",
    meaning: "材料记录的在册户数从天宝十三载的九百六十余万户，降到乾元三年一百六十九州所登记的一百九十余万户，前后差距极大。",
    interpretation: "这组数据适合比较安史之乱前后国家汲取资源和控制人口能力的变化。",
    limitation: "户籍减少不能直接换算成死亡人数。", rights: "只呈现必要数字关系与卷次定位。", questionIds: [2, 3], recommended: true,
  },
  {
    id: "SRC-ZZTJ-216", title: "《资治通鉴》卷二一六：安禄山兼领三镇", nature: "官修史书", role: "关键转折", institution: "维基文库公开古籍文本", period: "北宋编纂，记唐玄宗时期", locator: "《资治通鉴》卷二一六", url: "https://zh.wikisource.org/zh-hans/%E8%B3%87%E6%B2%BB%E9%80%9A%E9%91%91/%E5%8D%B7216",
    excerpt: "禄山既兼领三镇，赏刑己出，日益骄恣。自以曩时不拜太子，见上春秋高，颇内惧；又见武备堕弛，有轻中国之心。",
    contextNote: "这是北宋编纂的编年史，应与唐代制度文书和其他史书互证。",
    meaning: "材料说安禄山兼任三个边镇节度使后，能够自行决定奖赏和刑罚；他又看到中央武备松弛，逐渐产生轻视和反叛朝廷的想法。",
    interpretation: "它让学生把安史之乱放回边军扩张、节度使权力集中和中央用人机制中解释。",
    limitation: "不能把复杂转折归结为单个人物品行。", rights: "古籍文本公开；课堂使用保留卷次。", questionIds: [2], recommended: true,
  },
  {
    id: "SRC-XTS-BING", title: "《新唐书·兵志》论藩镇权力", nature: "官修史书", role: "后续影响", institution: "维基文库公开古籍文本", period: "北宋官修，记唐代", locator: "《新唐书》兵志", url: "https://zh.wikisource.org/wiki/%E6%96%B0%E5%94%90%E6%9B%B8",
    excerpt: "（藩镇）既有其土地，又有其人民，又有其甲兵，又有其财赋。以布列天下，然而自肆于人上，卒以此分裂天下，而唐遂以亡矣。",
    contextNote: "这段概括带有宋代史家对唐代藩镇问题的总结性判断。",
    meaning: "史家概括说，藩镇同时控制辖区土地、人口、军队和财政，并凭借这些资源自行其是，最终造成国家分裂。",
    interpretation: "它可以帮助学生解释地方同时掌握土地、人口、军队和财赋后，中央控制为何持续减弱。",
    limitation: "史家总结不能替代对不同地区、不同阶段藩镇实际行为的比较。", rights: "古籍文本公开；使用必要短引。", questionIds: [3], recommended: true,
  },
  {
    id: "SRC-HESHUO", title: "“河朔故事”与唐代东北边疆治理", nature: "学者研究", role: "反例限制", institution: "中国社会科学网", period: "2021", locator: "张天虹，中国社会科学报", url: "https://www.cssn.cn/mzx/xksy_lswh/202208/t20220803_5447848.shtml",
    excerpt: "学者观点摘编：河朔藩镇并非始终与唐廷完全对立。它们在承认唐帝共主、接受官爵的同时保留较强地方自主性，并在一定时期承担东北边疆防御。唐廷与藩镇之间既有冲突，也存在妥协和相互利用。",
    contextNote: "文章从唐廷与藩镇互动出发，讨论妥协、控制和边疆治理的复杂关系。",
    meaning: "研究认为，河朔藩镇一面保留较强自主权，一面仍承认唐朝皇帝并接受朝廷官爵，有时还承担边防，因此双方并非只有持续对抗。",
    interpretation: "它能纠正“藩镇出现后唐朝立即失去全部统治”的简单结论，也解释王朝为何仍延续一百余年。",
    limitation: "河朔经验不能代表所有藩镇，也不能否定藩镇割据造成的长期压力。", rights: "保留作者、机构和原文链接，只用必要概述。", questionIds: [3], recommended: true,
  },
  {
    id: "SRC-LIUYAN", title: "刘晏财政改革与唐后期国家恢复", nature: "学者研究", role: "反例限制", institution: "中国社会科学网", period: "2026", locator: "王昉《中国社会科学报》", url: "https://www.cssn.cn/skgz/bwyc/202604/t20260421_5981203.shtml",
    excerpt: "学者观点摘编：安史之乱后，户籍、租庸调和漕运体系受到破坏。刘晏整顿江淮转运、改革盐政并调节物价，使唐廷重新获得较稳定的财政来源，说明王朝在转衰过程中仍具有制度修复能力。",
    contextNote: "文章依据唐代制度史料和现代财政史研究讨论刘晏改革。",
    meaning: "研究指出，刘晏通过整顿江淮漕运、改革盐政和调节物价，为战乱后的唐朝恢复了较稳定的财政收入。",
    interpretation: "这条材料说明转衰不等于停止治理，王朝仍能通过制度调整维持运行。",
    limitation: "财政恢复并不意味着盛世结构已经完整恢复。", rights: "保留作者、机构和原文链接。", questionIds: [3], recommended: false,
  },
  {
    id: "SRC-DU-FU-WAR", title: "杜甫“三吏三别”中的战乱社会", nature: "文学史料", role: "后续影响", institution: "维基文库公开古籍文本", period: "唐", locator: "《石壕吏》《无家别》等", url: "https://zh.wikisource.org/wiki/%E7%9F%B3%E5%A3%95%E5%90%8F",
    excerpt: "暮投石壕村，有吏夜捉人。老翁逾墙走，老妇出门看。吏呼一何怒，妇啼一何苦！听妇前致词：“三男邺城戍。一男附书至，二男新战死。”",
    contextNote: "诗歌来自亲历战乱的作者，具有见闻价值，也经过文学选择与塑造。",
    meaning: "诗中写官吏夜间到村里征人，一户老妇的三个儿子都被征去守邺城，其中两个已经战死，家庭仍面临继续服役的压力。",
    interpretation: "它让学生观察战争如何进入征兵、家庭和基层社会，而不仅是朝廷权力变化。",
    limitation: "个别地点和文学叙事不能直接代表全国损失规模。", rights: "古籍文本公开；使用必要短引。", questionIds: [2], recommended: false,
  },
  {
    id: "SRC-BU-NIAN", title: "唐鎏金舞马衔杯纹银壶", nature: "考古实物", role: "背景条件", institution: "陕西历史博物馆", period: "唐", locator: "何家村窖藏馆藏页", url: "https://www.sxhm.com/en/detail/469.html",
    excerpt: "课堂观察材料：银壶为扁圆形，造型近似北方游牧民族使用的皮囊壶；壶腹两面錾刻鎏金舞马，马口衔杯，长鬃披散，前腿直立、后腿屈曲。器物出土于西安何家村唐代窖藏。",
    contextNote: "出土器物反映宫廷、工艺与文化交流，应放回窖藏和精英生活语境。",
    meaning: "这件银壶把北方游牧民族皮囊壶的造型与唐代宫廷舞马纹饰结合起来，制作工艺精细，出土地点属于长安地区的唐代窖藏。",
    interpretation: "它可为盛唐物质文化和交流提供实物视角，与制度和文学材料形成不同证据类型。",
    limitation: "不能证明普通社会普遍富裕。", rights: "图片许可未明确，演示只展示元数据和官方入口。", questionIds: [1], recommended: false,
  },
  {
    id: "SRC-POPULATION", title: "《中国历代人口观》中的唐代人口分析", nature: "学者研究", role: "后续影响", institution: "中国社会科学网", period: "公开研究", locator: "《中国历代人口观（上）》唐代部分", url: "https://jds.cssn.cn/xscg/xslw/201605/t20160506_5251910.shtml",
    excerpt: "学者观点摘编：战乱与人口流动使北方户籍和生产受到严重影响，人口继续向南方迁移。江淮地区的农业、漕运和财赋对唐后期朝廷更为重要，王朝的区域经济结构因而发生长期变化。",
    contextNote: "研究把人口登记、区域经济和漕运变化放在一起考察。",
    meaning: "研究指出，战乱促使人口继续南迁，北方生产和户籍受损；唐后期朝廷越来越依赖江淮地区提供农业产出、漕运和财政收入。",
    interpretation: "它支持学生从区域重心和财政来源变化解释唐后期国家结构。",
    limitation: "宏观趋势仍需具体史料和地区案例支撑。", rights: "保留机构和原文链接。", questionIds: [2, 3], recommended: false,
  },
  {
    id: "SRC-HUANGCHAO", title: "《旧唐书》所载黄巢起义与唐末局势", nature: "官修史书", role: "直接原因", institution: "维基文库公开古籍文本", period: "后晋官修，记唐末", locator: "《旧唐书》列传第一百五十", url: "https://zh.wikisource.org/wiki/%E8%88%8A%E5%94%90%E6%9B%B8",
    excerpt: "黄巢，曹州冤句人，本以贩盐为事。乾符中，仍岁凶荒，人饥为盗，河南尤甚。初，王仙芝起于濮阳，巢聚众数千，往从之，累破州县。",
    contextNote: "官修史书的叙事立场和人物评价需要与其他材料比较。",
    meaning: "材料说乾符年间连续发生灾荒，河南一带饥饿严重；王仙芝起事后，黄巢聚集数千人加入，并接连攻破州县。",
    interpretation: "它帮助区分长期结构性问题与最终加速唐朝灭亡的直接冲击。",
    limitation: "不能把王朝灭亡只归因于一次起义。", rights: "古籍文本公开；使用必要概述与卷次定位。", questionIds: [3], recommended: false,
  },
  {
    id: "SRC-XIYU", title: "西域出土唐代汉文文书研究", nature: "出土文书", role: "反例限制", institution: "中国社会科学网", period: "2023", locator: "西域出土唐代汉文文书研究", url: "https://www.cssn.cn/skgz/bwyc/202308/t20230817_5679369.shtml",
    excerpt: "研究摘编：安史之乱后，中原与西域的交通联系受阻，但西域军镇仍通过地方税粮、仓储和文书行政维持运转。出土文书留下了征收、支用与人员组织的具体记录，显示地方制度具有一定延续性。",
    contextNote: "研究依据和田等地出土文书讨论军镇、税粮与地方社会。",
    meaning: "出土文书显示，安史之乱后西域与中原联系受阻，但当地军镇仍在征收和支用税粮、管理仓储与组织人员，行政并未立刻停止。",
    interpretation: "它提供中央衰弱后地方制度仍有韧性的具体材料，丰富“转衰但未立即灭亡”的解释。",
    limitation: "西域个案不能直接代表唐朝内地。", rights: "保留作者、机构和原文链接。", questionIds: [3], recommended: false,
  },
];

export const emptySourceDraft: SourceDiscoveryDraft = { fixtureVersion: 2, selectedIds: [], batch: 0, needs: [], customNeed: "", ownMaterials: [] };

export function normalizeSourceDraft(value?: Partial<SourceDiscoveryDraft>): SourceDiscoveryDraft {
  return {
    fixtureVersion: 2,
    selectedIds: Array.isArray(value?.selectedIds) && (value.fixtureVersion === 2 || value.selectedIds.length > 0) ? value.selectedIds.filter((id) => sourceFixture.some((source) => source.id === id)) : sourceFixture.filter((source) => source.recommended).map((source) => source.id),
    batch: typeof value?.batch === "number" ? value.batch : 0,
    needs: Array.isArray(value?.needs) ? value.needs : [],
    customNeed: typeof value?.customNeed === "string" ? value.customNeed : "",
    ownMaterials: Array.isArray(value?.ownMaterials) ? value.ownMaterials : [],
  };
}

export function toggleSourceSelection(draft: SourceDiscoveryDraft, sourceId: string): SourceDiscoveryDraft {
  return { ...draft, selectedIds: draft.selectedIds.includes(sourceId) ? draft.selectedIds.filter((id) => id !== sourceId) : [...draft.selectedIds, sourceId] };
}

export function getSourceSetSummary(draft: SourceDiscoveryDraft) {
  const selected = sourceFixture.filter((source) => draft.selectedIds.includes(source.id));
  const covered = new Set(selected.flatMap((source) => source.questionIds));
  const natures = new Set(selected.map((source) => source.nature));
  return {
    selected,
    selectedCount: selected.length,
    kindCount: natures.size,
    coverage: [1, 2, 3].map((id) => covered.has(id)),
    ready: selected.length >= 4 && selected.length <= 8 && covered.size === 3 && natures.size >= 3,
  };
}
