import fs from 'fs';
import path from 'path';

const dir = path.resolve('G:/TaPa/src/industry-packs');

const themes = {
  crossborder: ['#2563eb', 'rgba(37,99,235,0.18)', 'rgba(37,99,235,0.04)'],
  usedcar: ['#ef4444', 'rgba(239,68,68,0.18)', 'rgba(239,68,68,0.04)'],
  hr: ['#8b5cf6', 'rgba(139,92,246,0.18)', 'rgba(139,92,246,0.04)'],
  tourism: ['#38a3d1', 'rgba(56,163,209,0.18)', 'rgba(56,163,209,0.04)'],
  fitness: ['#22c55e', 'rgba(34,197,94,0.18)', 'rgba(34,197,94,0.04)'],
  pet: ['#f59e0b', 'rgba(245,158,11,0.18)', 'rgba(245,158,11,0.04)'],
  food: ['#f97316', 'rgba(249,115,22,0.18)', 'rgba(249,115,22,0.04)'],
  catering: ['#dc2626', 'rgba(220,38,38,0.18)', 'rgba(220,38,38,0.04)'],
  legal: ['#64748b', 'rgba(100,116,139,0.18)', 'rgba(100,116,139,0.04)'],
  pharma: ['#06b6d4', 'rgba(6,182,212,0.18)', 'rgba(6,182,212,0.04)'],
  agriculture: ['#65a30d', 'rgba(101,163,13,0.18)', 'rgba(101,163,13,0.04)'],
};

function field(key, label, type = 'text', options = null, required = false) {
  const item = { key, label, type };
  if (options) item.options = options;
  if (required) item.required = true;
  return item;
}

function action(title, description, prompt) {
  return { title, description, action: 'go-chat', prompt };
}

function pack(data) {
  const theme = themes[data.id];
  return {
    id: data.id,
    name: data.name,
    icon: data.icon,
    tagline: data.tagline,
    category: data.category,
    order: data.order,
    assistantTitle: `${data.name}助手`,
    assistantTagline: data.assistantTagline,
    themeColor: { primary: theme[0], glow: theme[1], bg_tint: theme[2] },
    aiPersona: data.aiPersona,
    hotspotSources: data.hotspotSources,
    customerFields: data.customerFields,
    quickActions: data.quickActions,
    radar: {
      hotspots: data.radarHotspots.map((title, i) => ({ source: ['行业趋势', '客户需求', '运营机会'][i] || '行业趋势', title })),
      opportunities: data.opportunities.map((item) => ({ title: item[0], hint: item[1] })),
      trends: data.trends.map((keyword, i) => ({ keyword, change: [0.22, 0.18, 0.15][i] || 0.12, period: '7d' })),
    },
    prompts: [],
    dashboard: { widgets: [{ type: 'funnel', title: `${data.name}客户推进`, stages: data.stages }] },
  };
}

const packs = [
  pack({
    id: 'crossborder', name: '跨境贸易', icon: '🌍', category: 'sales_growth', order: 30,
    tagline: '外贸询盘、报价邮件和海外客户跟进。',
    assistantTagline: '懂询盘 · 懂报价 · 懂英文跟进',
    aiPersona: '你是一位跨境贸易和外贸业务助手，熟悉询盘、报价、样品、PI、付款方式、物流条款、展会线索和海外客户跟进。回答时可以提供中英文话术，但不要伪造合同事实或承诺不可控交付。',
    hotspotSources: ['alibaba_global', 'made_in_china', 'google_trends', 'weibo_hot'],
    customerFields: [field('company_name', '海外客户/公司名', 'text', null, true), field('country', '国家/地区', 'text', null, true), field('product_interest', '询盘产品', 'text', null, true), field('trade_terms', '贸易条款', 'select', ['EXW', 'FOB', 'CIF', 'DDP', '未确定']), field('payment_method', '付款方式', 'select', ['T/T', 'L/C', 'PayPal', '信用卡', '未确定']), field('stage', '跟进阶段', 'select', ['新询盘', '报价', '寄样', '谈判', 'PI/合同', '已成交', '复购'], true)],
    quickActions: [action('写英文开发信', '生成海外客户破冰邮件', '请根据当前跨境客户资料，生成一封英文开发信，要求简洁、专业、有明确 CTA，并附中文解释。'), action('生成报价跟进', '报价后催单和异议处理', '请生成英文报价后跟进邮件，包含价格、交期、样品和下一步确认。'), action('整理客户询盘', '拆解需求、风险和待确认问题', '请整理当前跨境客户询盘，输出已知需求、风险点、待确认问题和下一步跟进计划。')],
    radarHotspots: ['小单快反、样品转化和 WhatsApp 跟进影响成交。', 'B2B 平台询盘质量分化，独立站线索需要精细跟进。', '物流价格和交期波动影响报价有效期。'],
    opportunities: [['报价后 48 小时跟进', '报价后两天内补发差异化价值和样品方案。'], ['展会线索分级', '按国家、采购量和决策时间筛选高优先级客户。']],
    trends: ['英文开发信', '样品转化', 'WhatsApp 跟进'],
    stages: ['询盘', '报价', '寄样', '成交'],
  }),
  pack({
    id: 'usedcar', name: '二手车交易', icon: '🚗', category: 'sales_growth', order: 40,
    tagline: '购车线索、试驾邀约和置换贷款跟进。',
    assistantTagline: '懂预算 · 懂试驾 · 懂置换贷款',
    aiPersona: '你是一位二手车销售与门店线索跟进助手，熟悉预算、车型偏好、车况、试驾、置换和贷款。回答时帮助销售推进线索、整理车况卖点和异议处理，不隐瞒事故、水泡、重大维修等关键信息。',
    hotspotSources: ['dongchedi', 'autohome', 'douyin_hot', 'baidu_hot'],
    customerFields: [field('customer_name', '客户姓名', 'text', null, true), field('car_interest', '意向车型', 'text', null, true), field('budget', '预算', 'select', ['<5万', '5-10万', '10-20万', '20-30万', '30万+']), field('usage', '用车场景', 'tags', ['家用', '通勤', '商务', '营运', '练手', '置换升级']), field('finance_need', '金融/置换需求', 'tags', ['贷款', '全款', '置换', '分期', '保险', '上牌']), field('stage', '跟进阶段', 'select', ['新线索', '推荐车型', '到店试驾', '报价谈判', '订车', '成交回访'], true)],
    quickActions: [action('生成试驾邀约', '按车型和预算邀约到店', '请根据当前二手车客户资料，生成一段试驾邀约话术，突出车型卖点、到店理由和时间确认。'), action('整理车况卖点', '把车况、价格和保障讲清楚', '请整理车况卖点和客户关心问题回应，注意不得隐瞒重大车况。'), action('贷款置换跟进', '生成金融/置换沟通话术', '请为当前二手车客户生成贷款/置换跟进话术，包含资料提醒、预算解释和下一步动作。')],
    radarHotspots: ['新能源二手车价格波动带来询价机会。', '到店试驾率和金融方案影响成交效率。', '车况透明、质保和价格对比仍是核心问题。'],
    opportunities: [['试驾前确认预算', '邀约前确认预算、用车场景和付款方式，减少无效到店。'], ['置换客户优先跟进', '有旧车置换需求的客户成交概率更高。']],
    trends: ['新能源二手车', '置换', '试驾邀约'],
    stages: ['线索', '试驾', '报价', '成交'],
  }),
  pack({
    id: 'hr', name: '人力资源', icon: '🧑‍💼', category: 'sales_growth', order: 50,
    tagline: '候选人、企业职位和面试流程管理。',
    assistantTagline: '懂 JD · 懂候选人 · 懂面试推进',
    aiPersona: '你是一位人力资源与猎头顾问助手，熟悉岗位 JD、候选人沟通、面试流程、薪资预期和 offer 推进。回答时帮助整理信息和生成沟通材料，不做歧视性筛选，不输出违法用工建议。',
    hotspotSources: ['lagou_hot', 'boss_zhipin', 'linkedin', 'weibo_hot'],
    customerFields: [field('candidate_or_client', '候选人/企业名', 'text', null, true), field('role_name', '岗位名称', 'text', null, true), field('seniority', '岗位级别', 'select', ['实习', '初级', '中级', '高级', '专家', '经理', '总监', '高管']), field('salary_range', '薪资范围'), field('skills', '核心技能', 'tags'), field('stage', '跟进阶段', 'select', ['新需求', '找人中', '候选推荐', '面试中', 'Offer', '入职跟进'], true)],
    quickActions: [action('写岗位 JD', '生成清晰可发布的招聘 JD', '请根据当前 HR/招聘资料，生成一份岗位 JD，包括职责、要求、加分项、薪资亮点和候选人画像。'), action('候选人推荐报告', '整理卖点、风险和匹配度', '请生成候选人推荐报告：匹配点、风险点、面试建议和推荐话术。'), action('面试后跟进', '生成候选人与客户两边的话术', '请分别生成给候选人和企业 HR 的面试后跟进话术。')],
    radarHotspots: ['AI、出海、销售增长岗位需求仍活跃。', '候选人更关注稳定性、成长和薪酬结构。', '用人部门更看重可验证成果。'],
    opportunities: [['推荐报告标准化', '提前说清候选人优势和风险，减少客户反复追问。'], ['Offer 前风险排查', '终面前确认薪资、到岗和多 offer 风险。']],
    trends: ['AI 岗位', '候选人推荐', 'Offer 推进'],
    stages: ['需求', '推荐', '面试', 'Offer', '入职'],
  }),
  pack({
    id: 'tourism', name: '旅游服务', icon: '✈️', category: 'store_ops', order: 110,
    tagline: '出行咨询、定制方案和签证材料跟进。',
    assistantTagline: '懂线路 · 懂预算 · 懂材料进度',
    aiPersona: '你是一位旅游服务与定制出行顾问，熟悉自由行、跟团游、签证材料、亲子游、公司团建和高端定制。回答时先确认目的地、人数、预算、出行时间和签证/机酒状态，不承诺签证必过。',
    hotspotSources: ['mafengwo', 'ctrip', 'xiaohongshu_travel', 'weibo_hot'],
    customerFields: [field('customer_name', '客户/家庭名', 'text', null, true), field('destination', '意向目的地', 'text', null, true), field('travel_type', '出行类型', 'select', ['自由行', '跟团游', '定制游', '亲子游', '公司团建', '研学']), field('budget_level', '预算区间', 'select', ['<3000/人', '3000-8000/人', '8000-2万/人', '2万+/人']), field('needs', '核心需求', 'tags', ['签证', '机票', '酒店', '包车', '亲子', '老人友好']), field('stage', '跟进阶段', 'select', ['咨询', '方案中', '报价', '收材料', '已成交', '出行后回访'], true)],
    quickActions: [action('生成出行方案', '按目的地、预算和人数生成方案框架', '请生成一份出行方案框架：路线亮点、预算拆分、注意事项、下一步需要确认的问题。'), action('整理签证材料', '输出材料清单和客户提醒话术', '请整理签证/出行材料清单，并生成提醒客户补材料的话术。注意不要承诺签证结果。'), action('跟进未成交客户', '生成报价后催单和异议处理', '请生成报价后的跟进话术，包含预算异议、时间犹豫和同行对比处理。')],
    radarHotspots: ['亲子游、银发游和小众目的地咨询升温。', '热门国家材料周期与出签节奏变化。', '城市漫游和轻奢酒店带动询盘。'],
    opportunities: [['节假日提前锁单', '对暑期、十一、春节意向客户提前推材料清单。'], ['企业团建套餐', '把团建客户按预算和人数拆成三档方案。']],
    trends: ['亲子游', '签证材料', '小众路线'],
    stages: ['咨询', '方案', '报价', '成交'],
  }),
  pack({
    id: 'fitness', name: '健身服务', icon: '🏋️', category: 'store_ops', order: 120,
    tagline: '会员续费、私教转化和沉睡用户唤醒。',
    assistantTagline: '懂会员 · 懂续费 · 懂私教转化',
    aiPersona: '你是一位健身房和私教工作室经营助手，关注会员目标、到店频率、剩余课时、续费风险和私教转化。回答时给可执行邀约、关怀和续费话术，不做医疗诊断或保证减脂效果。',
    hotspotSources: ['xiaohongshu_fitness', 'douyin_hot', 'weibo_hot'],
    customerFields: [field('member_name', '会员姓名', 'text', null, true), field('fitness_goal', '训练目标', 'tags', ['减脂', '增肌', '塑形', '康复', '体态改善']), field('membership_type', '会员类型', 'select', ['体验课', '月卡', '季卡', '年卡', '私教包', '团课会员']), field('remaining_sessions', '剩余课时', 'number'), field('risk_tags', '风险标签', 'tags', ['久未到店', '快到期', '价格敏感', '效果焦虑']), field('stage', '跟进阶段', 'select', ['新线索', '体验课', '已办卡', '私教转化', '续费中', '沉睡'], true)],
    quickActions: [action('写续费话术', '结合剩余课时和目标生成续费提醒', '请生成一段续费跟进话术，语气自然，不制造焦虑，突出阶段成果和下一步训练计划。'), action('唤醒沉睡会员', '生成久未到店客户召回方案', '请为久未到店会员生成召回方案：微信话术、到店激励和教练跟进动作。'), action('私教转化建议', '输出体验课后私教转化路径', '请设计体验课后的私教转化路径，包括痛点确认、课程包建议和异议处理。')],
    radarHotspots: ['普拉提、体态改善和女性力量训练内容升温。', '低频会员唤醒和私教续费成为门店重点。', '短视频训练打卡带来引流机会。'],
    opportunities: [['到期前 14 天续费', '按剩余课时和训练目标提前启动续费关怀。'], ['沉睡会员低门槛召回', '用体测复盘/免费纠姿替代硬促销。']],
    trends: ['普拉提', '私教续费', '体态改善'],
    stages: ['线索', '体验', '转化', '续费'],
  }),
  pack({
    id: 'pet', name: '宠物服务', icon: '🐾', category: 'store_ops', order: 130,
    tagline: '宠物档案、到店提醒和会员关怀。',
    assistantTagline: '懂宠物档案 · 懂到店周期 · 懂会员关怀',
    aiPersona: '你是一位宠物店、宠物医院和宠物美容门店的经营助手，关注宠物档案、疫苗驱虫、美容周期、复购提醒和会员关怀。回答以服务提醒和客户沟通为主，不替代兽医诊断。',
    hotspotSources: ['xiaohongshu_pet', 'douyin_hot', 'weibo_hot'],
    customerFields: [field('owner_name', '主人姓名', 'text', null, true), field('pet_name', '宠物名', 'text', null, true), field('pet_type', '宠物类型', 'select', ['猫', '狗', '兔', '仓鼠', '鸟', '其他']), field('service_needs', '服务需求', 'tags', ['洗护', '美容', '驱虫', '疫苗', '寄养', '用品', '粮食复购']), field('last_service_date', '上次服务日期', 'date'), field('stage', '跟进阶段', 'select', ['新客', '会员', '待复购', '待到店', '沉睡', '高价值'], true)],
    quickActions: [action('写到店提醒', '按服务周期生成洗护/驱虫提醒', '请生成一段到店提醒话术，包含宠物名字、服务周期和温和的预约引导。'), action('会员关怀话术', '生成生日、节日和复购关怀', '请生成会员关怀话术，适合微信发送，语气亲切，不硬推销。'), action('用品复购建议', '整理粮食、洗护、驱虫复购提醒', '请整理用品/粮食/驱虫复购建议和跟进话术，不做医疗诊断。')],
    radarHotspots: ['宠物洗护、美毛和科学喂养内容热度上升。', '节假日寄养和会员卡复购成为重点。', '主粮和智能用品复购机会增加。'],
    opportunities: [['服务周期提醒', '按上次洗护/驱虫日期自动生成到店提醒。'], ['高价值会员维护', '多宠家庭和高频客户做专属权益沟通。']],
    trends: ['宠物洗护', '主粮复购', '寄养预约'],
    stages: ['新客', '会员', '复购', '回访'],
  }),
  pack({
    id: 'food', name: '食品零售', icon: '🍱', category: 'store_ops', order: 140,
    tagline: '渠道客户、订货复购和新品推广。',
    assistantTagline: '懂订货 · 懂复购 · 懂新品推广',
    aiPersona: '你是一位食品零售和食品渠道客户经营助手，关注渠道客户、订货周期、保质期、新品推广、复购和客诉处理。回答时强调食品安全、真实卖点和合规宣传，不夸大功效。',
    hotspotSources: ['douyin_food', 'xiaohongshu_food', 'weibo_hot', 'baidu_hot'],
    customerFields: [field('customer_name', '客户/渠道名', 'text', null, true), field('food_category', '食品品类', 'select', ['休闲零食', '饮品', '烘焙', '预制菜', '生鲜', '调味品', '地方特产']), field('channel_type', '渠道类型', 'select', ['门店', '社区团购', '商超', '批发', '餐饮渠道', '电商', '私域']), field('order_cycle', '订货周期', 'select', ['每周', '半月', '每月', '季度', '不固定']), field('concerns', '关注点', 'tags', ['价格', '保质期', '口味', '包装', '物流', '动销', '食品安全']), field('stage', '跟进阶段', 'select', ['新客', '试样', '首单', '复购', '新品推广', '沉睡'], true)],
    quickActions: [action('写订货复购提醒', '按订货周期生成跟进话术', '请生成订货复购提醒话术，突出真实卖点、动销和服务保障。'), action('生成新品推广', '写新品介绍和渠道卖点', '请生成新品推广话术，包括适合渠道、卖点、试样建议和下单引导，不得夸大功效。'), action('处理食品客诉', '生成食品安全/口味/物流客诉回复', '请生成食品客户客诉处理话术，包含安抚、核实、补偿边界和后续复购维护。')],
    radarHotspots: ['健康零食、低糖饮品和地方特产热度上升。', '社区团购和私域复购依赖稳定供货。', '食品宣传需避免夸大功效。'],
    opportunities: [['按订货周期复购', '用上次订货日期和订货周期预测复购提醒。'], ['新品试样转首单', '给渠道客户提供试样、陈列和动销话术。']],
    trends: ['健康零食', '复购提醒', '地方特产'],
    stages: ['试样', '首单', '复购', '新品'],
  }),
  pack({
    id: 'catering', name: '餐饮服务', icon: '🍜', category: 'store_ops', order: 150,
    tagline: '门店会员、活动方案和客诉处理。',
    assistantTagline: '懂门店 · 懂活动 · 懂客诉处理',
    aiPersona: '你是一位餐饮门店经营助手，熟悉会员复购、套餐活动、外卖平台、门店客诉和社群运营。回答时给出可执行活动方案和话术，关注食品安全与真实服务，不夸大宣传。',
    hotspotSources: ['dianping', 'meituan', 'douyin_food', 'xiaohongshu_food'],
    customerFields: [field('member_name', '顾客/会员名', 'text', null, true), field('store_type', '门店类型', 'select', ['中餐', '火锅', '烧烤', '快餐', '咖啡茶饮', '烘焙', '小吃', '外卖店']), field('preference', '口味/偏好', 'tags', ['辣', '清淡', '甜品', '套餐', '家庭餐', '商务宴请', '外卖', '到店']), field('member_level', '会员等级', 'select', ['新客', '普通会员', '高频会员', '储值会员', '沉睡会员']), field('issue_tags', '客诉/关注点', 'tags', ['等位久', '出餐慢', '口味', '服务', '价格', '卫生', '配送', '评价']), field('stage', '跟进阶段', 'select', ['新客', '复购', '储值', '活动邀约', '客诉处理', '沉睡唤醒'], true)],
    quickActions: [action('生成活动方案', '按门店类型设计活动和话术', '请生成门店活动方案：目标人群、套餐设计、社群话术、执行步骤和注意事项。'), action('写老客召回', '唤醒久未到店会员', '请生成老客召回话术，语气自然，带明确到店/下单引导。'), action('处理客诉回复', '生成差评/客诉安抚话术', '请生成餐饮客诉处理回复，包含安抚、核实、补偿边界和复购挽回。')],
    radarHotspots: ['小套餐、储值会员和社群活动成为门店增长重点。', '评价、出餐速度和复购券影响平台排序。', '探店短视频和本地生活团购持续带来新客。'],
    opportunities: [['沉睡会员召回', '按上次到店时间筛选 30 天未到店客户做小额券召回。'], ['差评转回访', '差评处理后 24 小时内做二次回访。']],
    trends: ['本地生活', '储值会员', '客诉处理'],
    stages: ['新客', '复购', '储值', '回访'],
  }),
  pack({
    id: 'legal', name: '法律服务', icon: '⚖️', category: 'professional_services', order: 210,
    tagline: '咨询线索、文书初稿和案件材料整理。',
    assistantTagline: '懂咨询记录 · 懂文书初稿 · 懂材料清单',
    aiPersona: '你是一位法律服务客户与材料整理助手，适合律师、律所商务和法律咨询团队使用。你可以整理咨询记录、案件时间线、证据清单和文书初稿，但必须提示由专业律师最终审核，不替代律师意见，不承诺案件结果。',
    hotspotSources: ['court_news', 'legal_news', 'baidu_hot', 'weibo_hot'],
    customerFields: [field('client_name', '客户/当事人', 'text', null, true), field('case_type', '事项类型', 'select', ['合同纠纷', '劳动争议', '婚姻家事', '交通事故', '债务催收', '知识产权', '公司法务']), field('urgency', '紧急程度', 'select', ['普通', '较急', '非常急', '已临近期限']), field('materials', '已有材料', 'tags', ['合同', '聊天记录', '转账记录', '发票', '录音', '照片', '身份材料']), field('case_summary', '案情摘要', 'textarea'), field('stage', '跟进阶段', 'select', ['初次咨询', '材料收集', '方案沟通', '委托中', '办理中', '回访'], true)],
    quickActions: [action('起草文书初稿', '生成律师审核前的文书框架', '请根据当前法律客户资料，起草一份文书初稿框架，并明确标注需要律师最终审核，不构成正式法律意见。'), action('整理案件时间线', '把事实经过整理成时间线', '请整理案件时间线：时间、事件、证据、待补充材料。'), action('生成证据清单', '列出已有证据和待补材料', '请生成证据清单和待补材料清单，并说明每类材料用途。')],
    radarHotspots: ['合同、劳动和债务类咨询线索持续高频。', '中小企业需要合同审查和催收材料整理。', '文书初稿必须保留律师审核和风险提示。'],
    opportunities: [['咨询记录标准化', '首次咨询后自动沉淀案情、证据和期限。'], ['材料清单提前发', '正式面谈前让客户补齐关键材料。']],
    trends: ['合同纠纷', '劳动争议', '证据清单'],
    stages: ['咨询', '材料', '委托', '办理'],
  }),
  pack({
    id: 'pharma', name: '制药医药', icon: '💊', category: 'professional_services', order: 220,
    tagline: '医药客户、拜访记录和竞品准入分析。',
    assistantTagline: '懂拜访 · 懂准入 · 懂竞品记录',
    aiPersona: '你是一位制药医药和医疗器械销售支持助手，适合医药代表、器械销售和渠道经理使用。你可以整理拜访记录、客户档案、准入状态、竞品信息和合规跟进计划，但不提供医疗诊断、用药建议或违规营销内容。',
    hotspotSources: ['pharma_news', 'nhsa_policy', 'medical_device_news', 'weibo_hot'],
    customerFields: [field('institution_name', '医院/机构/药店', 'text', null, true), field('department', '科室/渠道'), field('contact_role', '关键角色', 'select', ['医生', '主任', '药师', '采购', '院长', '经销商', '药店负责人']), field('product_line', '产品线', 'text', null, true), field('access_status', '准入状态', 'select', ['未接触', '已拜访', '资料递交', '准入中', '已准入', '竞品占优']), field('stage', '跟进阶段', 'select', ['线索', '拜访', '资料递交', '试用/准入', '采购推进', '维护'], true)],
    quickActions: [action('整理拜访记录', '生成合规拜访摘要和下一步', '请整理合规拜访记录：客户关注点、竞品情况、待补资料和下一步计划。不要提供医疗诊断或用药建议。'), action('生成准入推进', '梳理准入状态和材料清单', '请生成准入推进计划：关键角色、所需材料、风险点、下一步拜访动作。注意合规边界。'), action('竞品分析摘要', '整理竞品优势和应对口径', '请整理竞品分析摘要和合规沟通口径，避免夸大疗效或不当承诺。')],
    radarHotspots: ['集采、医保和院内准入政策影响拜访重点。', '科室需求、试用反馈和售后服务影响采购决策。', '医药营销更强调真实资料、合规记录和风险边界。'],
    opportunities: [['拜访记录标准化', '每次拜访后沉淀角色、需求、竞品和下一步动作。'], ['准入材料清单', '按医院/科室状态整理资料，减少反复沟通。']],
    trends: ['准入推进', '竞品记录', '合规拜访'],
    stages: ['线索', '拜访', '资料', '准入', '维护'],
  }),
  pack({
    id: 'agriculture', name: '农业农资', icon: '🌾', category: 'professional_services', order: 230,
    tagline: '农户档案、作物周期和农资复购提醒。',
    assistantTagline: '懂作物周期 · 懂农资复购 · 懂客户档案',
    aiPersona: '你是一位农业农资客户服务助手，熟悉农户、合作社、种植基地的客户档案、作物周期、农资复购和季节性营销。回答时围绕经营和服务提醒，不做病虫害确诊或替代农技专家判断。',
    hotspotSources: ['agri_news', 'baidu_hot', 'weibo_hot'],
    customerFields: [field('farm_name', '农户/基地名', 'text', null, true), field('crop_type', '主要作物', 'tags', ['水稻', '玉米', '小麦', '大豆', '蔬菜', '水果', '茶叶', '花卉']), field('acreage', '种植面积(亩)', 'number'), field('season_stage', '作物阶段', 'select', ['备耕', '播种', '苗期', '生长期', '采收', '休耕']), field('product_needs', '农资需求', 'tags', ['种子', '肥料', '农药', '农机', '滴灌', '技术服务']), field('stage', '跟进阶段', 'select', ['新客', '询价', '已采购', '复购', '技术服务', '沉睡'], true)],
    quickActions: [action('生成农资复购提醒', '按作物阶段生成采购提醒', '请生成农资复购提醒方案，包含作物阶段、推荐沟通重点和微信话术。不要做病虫害确诊。'), action('整理农户档案', '把作物、面积、采购周期整理成客户摘要', '请整理一份客户档案摘要，并列出下一步跟进重点。'), action('写季节营销话术', '生成按农时触达客户的话术', '请生成季节性农资营销话术，突出实际收益和服务保障，避免夸大承诺。')],
    radarHotspots: ['春耕、肥料价格和作物预警影响采购节奏。', '种植基地更关注技术服务和稳定供货。', '合作社、基地和绿色农业带来服务机会。'],
    opportunities: [['按农时触达', '把客户按作物阶段分组，提前推肥料/农药/技术服务提醒。'], ['大户档案经营', '对种植面积大、采购稳定的客户做年度服务计划。']],
    trends: ['农资复购', '种植基地', '绿色农业'],
    stages: ['询价', '采购', '复购', '服务'],
  }),
];

for (const item of packs) {
  fs.writeFileSync(path.join(dir, `${item.id}.json`), `${JSON.stringify(item, null, 2)}\n`, 'utf8');
}

console.log(`repaired ${packs.length} industry packs`);
