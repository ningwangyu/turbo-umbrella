# 基金收益预测助手 V2 项目图示

本文档根据项目根目录 [`PRODUCT.md`](../PRODUCT.md) 及已核对的关键实现文件生成，用于项目说明或论文材料整理。图示采用保守的工程表达，仅包含文档和代码中可证实的模块与能力。

## 一、系统架构图（模块化架构）

依据：`PRODUCT.md` 技术架构、模块化项目结构，以及各模块实现。

```mermaid
flowchart TB
    subgraph L1[用户交互层]
        Browser[Web 浏览器]
        CLI[CLI 终端]
        ChatPanel[AI 聊天面板]
    end

    subgraph L2[前端表现层]
        Index[templates/index.html\n单页应用入口]
        Frontend[static/js/app.js\n原生 JS 交互]
        Style[static/css/style.css\n响应式样式]
        Chart[Chart.js\n净值与行情图表]
        Storage[localStorage\n持仓本地持久化]
    end

    subgraph L3[Flask 应用层]
        App[app.py\n应用入口]
        Config[config.py\n配置管理]
        Cache[cache.py\n缓存系统]
    end

    subgraph L4[路由层 - Flask Blueprints]
        FundRoutes[routes/fund_routes.py\n/api/fund/*\n/api/import/*]
        MarketRoutes[routes/market_routes.py\n/api/market/*\n/api/price/*]
        AIRoutes[routes/ai_routes.py\n/api/ai/*]
        AlertRoutes[routes/alert_routes.py\n/api/alerts/*]
        PortfolioRoutes[routes/portfolio_routes.py\n/api/portfolio/*]
    end

    subgraph L5[业务服务层]
        FundSvc[services/fund_service.py\n基金数据服务]
        MarketSvc[services/market_service.py\n市场数据服务]
        AISvc[services/ai_service.py\nAI 服务]
        RecommendSvc[services/recommend_service.py\n推荐引擎]
        QuantSig[quant/signals.py\n5因子信号引擎]
    end

    subgraph L6[工程基础设施层]
        RateLimit[ratelimit.py\n令牌桶限流]
        ThreadPool[ThreadPoolExecutor\n并发推荐分析]
        Retry[错误重试与数据源降级]
    end

    subgraph L7[外部数据层]
        Eastmoney[东方财富\n估值、净值、持仓、排行、板块]
        Sina[新浪财经\n指数、LOF/ETF、贵金属、汇率]
        Search[东方财富搜索 API\n基金代码/名称互查]
        AIAPI[OpenAI-Compatible API\nChat 与 Vision]
    end

    Browser --> Index
    Index --> Frontend
    Frontend --> Style
    Frontend --> Chart
    Frontend --> Storage
    ChatPanel --> Frontend
    CLI --> FundSvc
    Frontend --> App

    App --> FundRoutes
    App --> MarketRoutes
    App --> AIRoutes
    App --> AlertRoutes
    App --> PortfolioRoutes

    FundRoutes --> FundSvc
    FundRoutes --> QuantSig
    FundRoutes --> RecommendSvc
    FundRoutes --> AISvc
    MarketRoutes --> MarketSvc
    AIRoutes --> AISvc
    AlertRoutes --> FundSvc
    PortfolioRoutes --> FundSvc

    FundSvc --> Cache
    MarketSvc --> Cache
    RecommendSvc --> ThreadPool
    RecommendSvc --> FundSvc
    RecommendSvc --> QuantSig
    AISvc --> Retry

    Cache --> RateLimit
    ThreadPool --> RateLimit
    Retry --> RateLimit

    RateLimit --> Eastmoney
    RateLimit --> Sina
    RateLimit --> Search
    AISvc --> AIAPI
```

## 二、核心功能图

依据：`PRODUCT.md` “核心功能模块”部分。

```mermaid
mindmap
  root((基金收益预测助手 V2))
    实时持仓管理
      添加与删除基金持仓
      基金代码自动补全名称
      文本粘贴批量导入
      图片识别批量导入
      资产总览统计
      localStorage 本地持久化
      正则与 AI 双引擎解析
    大盘行情监控
      上证指数
      深证成指
      创业板指
      成交量与成交额
      交易时间检测
      热门板块展示
    基金深度分析
      实时净值估值
      历史净值走势图
      重仓股持仓明细
      多周期收益展示
      基金详情弹窗
    多因子买卖信号
      五维因子评分
      0 到 100 综合分
      买入观望卖出等级
      因子明细与评分依据
    智能基金推荐
      多维基金池采集
      快速筛选
      并发深度分析
      综合评分
      推荐分级
    AI 智能助手
      悬浮聊天面板
      SSE 流式输出
      图片上传识别
      连续对话
      中文投资顾问回复
    附加功能
      贵金属行情
      价格提醒
      市场指数弹窗
```

## 三、技术亮点图

依据：`PRODUCT.md` “技术亮点与创新”部分，并将相关表述整理为可证实的工程亮点。

```mermaid
flowchart LR
    Center[基金收益预测助手 V2\n工程亮点]

    subgraph H1[多因子量化信号引擎]
        MA[MA20/60/120/250\n均线位置]
        RSI[RSI(14)\n超买超卖]
        Momentum[5/10/20 日收益率\n近期动量]
        Drawdown[当前净值相对高点\n回撤幅度]
        Percentile[历史净值百分位\n估值水平]
        SignalScore[加权合成\n0-100 买卖信号]
        MA --> SignalScore
        RSI --> SignalScore
        Momentum --> SignalScore
        Drawdown --> SignalScore
        Percentile --> SignalScore
    end

    subgraph H2[两阶段智能推荐引擎]
        Pool[东方财富排行榜\n候选基金池]
        Quick[快速评分\n收益、一致性、加速度]
        Top[Top 候选进入深度分析]
        Deep[ThreadPoolExecutor\n并发获取详情]
        Rank[收益、风险、夏普、\n一致性、技术面综合评分]
        Level[强烈推荐 / 推荐买入 / 值得关注]
        Pool --> Quick --> Top --> Deep --> Rank --> Level
    end

    subgraph H3[AI 多模态集成]
        VisionImport[Vision API\n图片识别导入]
        TextParse[JSON / 正则 / AI\n文本解析]
        StreamChat[SSE 流式对话\n打字机渲染]
        ImageChat[图片对话\n识别并回答]
    end

    subgraph H4[多源数据融合与容错]
        EM[东方财富\n基金主数据]
        SinaAPI[新浪财经\n指数与补充行情]
        Fallback[搜索 API\n代码名称互查]
        TTL[分级 TTL 缓存]
        Degrade[失败回退与降级]
        EM --> TTL
        SinaAPI --> TTL
        Fallback --> TTL
        TTL --> Degrade
    end

    subgraph H5[轻量工程化设计]
        Flask[Flask 模块化架构\nBlueprint 分层]
        NativeJS[原生 JS SPA]
        Charts[Chart.js 可视化]
        Limiter[线程安全令牌桶限流]
        Entry[Web 与 CLI 双入口]
    end

    Center --> H1
    Center --> H2
    Center --> H3
    Center --> H4
    Center --> H5
```
