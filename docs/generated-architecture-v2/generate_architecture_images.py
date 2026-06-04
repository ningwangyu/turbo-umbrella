from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(r"F:\Run_Project\clade\jijin")
OUT = ROOT / "docs" / "generated-architecture-v2"
OUT.mkdir(parents=True, exist_ok=True)

EXCLUDE_DIRS = {
    "docs/generated-architecture",
    "docs/generated-architecture-v2",
}

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
    r"C:\Windows\Fonts\simsun.ttc",
    r"C:\Windows\Fonts\arial.ttf",
]

FONT_PATH = next((path for path in FONT_CANDIDATES if Path(path).exists()), None)

if FONT_PATH:
    TITLE_FONT = ImageFont.truetype(FONT_PATH, 50)
    H_FONT = ImageFont.truetype(FONT_PATH, 30)
    TEXT_FONT = ImageFont.truetype(FONT_PATH, 22)
    SMALL_FONT = ImageFont.truetype(FONT_PATH, 18)
else:
    TITLE_FONT = H_FONT = TEXT_FONT = SMALL_FONT = ImageFont.load_default()

COLORS = {
    "bg": "#f7f9fc",
    "panel": "#ffffff",
    "ink": "#172033",
    "muted": "#607087",
    "line": "#d7dee8",
    "blue": "#2563eb",
    "cyan": "#0891b2",
    "green": "#059669",
    "purple": "#7c3aed",
    "amber": "#d97706",
    "red": "#dc2626",
    "slate": "#64748b",
    "soft_blue": "#eaf2ff",
    "soft_cyan": "#e7f7fb",
    "soft_green": "#e8f7f1",
    "soft_purple": "#f3ecff",
    "soft_amber": "#fff4df",
    "soft_red": "#fff0f0",
    "soft_slate": "#f1f5f9",
}


def should_skip(rel: str) -> bool:
    return any(rel == item or rel.startswith(item + "/") for item in EXCLUDE_DIRS)


def scan_files() -> list[str]:
    files = []
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(ROOT).as_posix()
        if should_skip(rel):
            continue
        files.append(rel)
    return sorted(files, key=lambda item: (item.split("/")[0].lower(), item.lower()))


def layer_for(rel: str) -> tuple[str, str, str]:
    if rel.startswith("src/routes/"):
        return "Flask API 路由层", COLORS["blue"], COLORS["soft_blue"]
    if rel.startswith("src/services/sentiment/"):
        return "市场情绪服务/存储层", COLORS["red"], COLORS["soft_red"]
    if rel.startswith("src/services/recommend/"):
        return "推荐算法服务层", COLORS["purple"], COLORS["soft_purple"]
    if rel.startswith("src/services/"):
        return "业务服务层", COLORS["green"], COLORS["soft_green"]
    if rel.startswith("src/quant/"):
        return "量化算法层", COLORS["purple"], COLORS["soft_purple"]
    if rel.startswith("src/static/js/"):
        return "前端 JS 交互层", COLORS["cyan"], COLORS["soft_cyan"]
    if rel.startswith("src/static/css/"):
        return "前端 CSS 样式层", COLORS["amber"], COLORS["soft_amber"]
    if rel.startswith("src/templates/"):
        return "前端 HTML 模板层", COLORS["cyan"], COLORS["soft_cyan"]
    if rel.startswith("src/tests/"):
        return "测试层", COLORS["slate"], COLORS["soft_slate"]
    if rel.startswith("src/__pycache__") or "/__pycache__/" in rel:
        return "Python 运行缓存", COLORS["slate"], COLORS["soft_slate"]
    if rel.startswith("src/"):
        return "应用入口/基础设施", COLORS["green"], COLORS["soft_green"]
    if rel.startswith("docs/images/"):
        return "文档图片资源", COLORS["amber"], COLORS["soft_amber"]
    if rel.startswith("docs/"):
        return "项目文档", COLORS["amber"], COLORS["soft_amber"]
    if rel.startswith(".agents/"):
        return "Agent 技能/部署配置", COLORS["purple"], COLORS["soft_purple"]
    if rel.startswith(".claude/"):
        return "Claude/Codex 本地配置", COLORS["purple"], COLORS["soft_purple"]
    if rel.startswith(".idea/"):
        return "IDE 工程配置", COLORS["slate"], COLORS["soft_slate"]
    if rel.startswith(".pytest_cache/") or rel.startswith("src/.pytest_cache/"):
        return "pytest 测试缓存", COLORS["slate"], COLORS["soft_slate"]
    if rel.startswith(".tabnine/"):
        return "Tabnine 辅助配置", COLORS["slate"], COLORS["soft_slate"]
    if rel.startswith("skills/") or rel == "skills-lock.json":
        return "技能锁/技能配置", COLORS["purple"], COLORS["soft_purple"]
    if rel.startswith("agent-placeholder-dirs/"):
        return "Agent 占位目录", COLORS["slate"], COLORS["soft_slate"]
    return "根目录/其他", COLORS["slate"], COLORS["soft_slate"]


def describe(rel: str) -> str:
    exact = {
        "src/app.py": "Flask 应用入口：创建 app、注册 Blueprint、启动后台情绪任务、渲染首页",
        "src/cli.py": "命令行入口：复用 services 完成持仓、信号、推荐、贵金属和配置查询",
        "src/config.py": "配置读取模块：加载 config.json 并导出 AI、TTL、限流等全局常量",
        "src/config.json": "运行配置：AI、外部 API、缓存、MySQL、推荐和服务端参数",
        "src/cache.py": "TTL 内存缓存：估值、业绩、重仓股、指数、板块、推荐、信号等缓存实例",
        "src/ratelimit.py": "令牌桶限流器：保护东方财富、新浪等外部接口",
        "requirements.txt": "Python 依赖清单",
        "start.bat": "Windows 一键启动脚本",
        "src/templates/index.html": "单页应用 HTML 骨架：导航、首页容器、弹窗与 Chart.js 引入",
        "skills-lock.json": "Agent/技能版本锁定文件",
    }
    if rel in exact:
        return exact[rel]
    name = Path(rel).name
    if name == "__init__.py":
        return "Python 包初始化文件"
    if rel.endswith(".pyc"):
        return "Python 自动编译缓存，可由源码重新生成"
    if rel.startswith("src/routes/"):
        return "Flask Blueprint 接口文件：解析请求、调用服务层并返回 JSON"
    if rel.startswith("src/services/sentiment/"):
        return "市场情绪子模块：抓取、存储、统计或后台刷新行情情绪数据"
    if rel.startswith("src/services/recommend/"):
        return "基金推荐子模块：候选池构建或评分计算"
    if rel.startswith("src/services/"):
        return "后端业务服务：封装外部数据、持久化、AI 或计算逻辑"
    if rel.startswith("src/quant/"):
        return "量化信号算法：多因子评分与买卖建议"
    if rel.startswith("src/static/js/backtest/"):
        return "定投回测前端子模块"
    if rel.startswith("src/static/js/fund-compare/"):
        return "基金对比前端子模块"
    if rel.startswith("src/static/js/portfolio/"):
        return "组合分析前端子模块"
    if rel.startswith("src/static/js/sentiment/"):
        return "市场情绪前端子模块"
    if rel.startswith("src/static/js/"):
        return "前端 ES 模块：页面交互、API 调用、状态或图表渲染"
    if rel.startswith("src/static/css/"):
        return "样式文件：布局、组件、弹窗、卡片或响应式规则"
    if rel.startswith("src/tests/"):
        return "pytest 测试文件或测试包初始化"
    if rel.startswith("docs/images/"):
        return "项目文档引用的架构图、功能图或技术亮点图片"
    if rel.startswith("docs/"):
        return "项目产品、架构或图示说明文档"
    if rel.startswith(".agents/skills/"):
        skill = rel.split("/")[2] if len(rel.split("/")) > 2 else "skill"
        return f"Agent 技能 {skill} 的说明、规则或资源文件"
    if rel.startswith("skills/"):
        skill = rel.split("/")[1] if len(rel.split("/")) > 1 else "skill"
        return f"本地技能 {skill} 的说明、规则或资源文件"
    if rel.startswith(".claude/"):
        return "Claude/Codex 本地运行配置"
    if rel.startswith(".idea/"):
        return "JetBrains IDE 工程元数据"
    if ".pytest_cache/" in rel:
        return "pytest 运行缓存和历史测试节点"
    return "项目辅助文件"


def group_for(rel: str) -> str:
    if rel.startswith("src/") and not rel.startswith("src/static/") and not rel.startswith("src/templates/"):
        if ".__pycache__" in rel:
            return "运行缓存"
        if "__pycache__" in rel:
            return "运行缓存"
        return "后端源码"
    if rel.startswith("src/static/") or rel.startswith("src/templates/"):
        return "前端源码"
    if rel.startswith("docs/"):
        return "项目文档"
    if rel.startswith(".agents/") or rel.startswith("skills/") or rel == "skills-lock.json":
        return "Agent/技能配置"
    if rel.startswith(".idea/") or rel.startswith(".claude/") or rel.startswith(".tabnine/") or rel.startswith("agent-placeholder-dirs/"):
        return "开发工具配置"
    if ".pytest_cache/" in rel or "__pycache__" in rel:
        return "运行缓存"
    return "根目录/其他"


def rounded(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], fill: str, outline: str, radius: int = 18) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=2)


def center(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], text: str, font: ImageFont.ImageFont, fill: str) -> None:
    bounds = draw.textbbox((0, 0), text, font=font)
    x = box[0] + (box[2] - box[0] - bounds[2] + bounds[0]) / 2
    y = box[1] + (box[3] - box[1] - bounds[3] + bounds[1]) / 2
    draw.text((x, y), text, font=font, fill=fill)


def wrap(text: str, max_chars: int) -> list[str]:
    if len(text) <= max_chars:
        return [text]
    lines = []
    rest = text
    while len(rest) > max_chars:
        cut = rest.rfind("/", 0, max_chars)
        if cut < max_chars * 0.35:
            cut = max_chars
        lines.append(rest[: cut + 1])
        rest = rest[cut + 1 :]
    if rest:
        lines.append(rest)
    return lines


def save_overview(files: list[str]) -> None:
    width, height = 2600, 1780
    image = Image.new("RGB", (width, height), COLORS["bg"])
    draw = ImageDraw.Draw(image)
    draw.text((90, 70), "基金收益预测助手 V2 - 项目架构总览", font=TITLE_FONT, fill=COLORS["ink"])
    draw.text((92, 136), f"当前快照覆盖 {len(files)} 个文件；生成图目录本身未纳入快照，避免递归扩张。", font=H_FONT, fill=COLORS["muted"])

    layers = [
        ("用户入口", "浏览器 Web 单页应用 / CLI 命令行", "Web 面向日常交互；CLI 复用服务层做快速查询与调试", COLORS["blue"], COLORS["soft_blue"]),
        ("前端展示层", "templates/index.html + static/css + static/js", "资产总览、基金卡片、组合分析、基金对比、回测、情绪、AI 晨报", COLORS["cyan"], COLORS["soft_cyan"]),
        ("Flask API 层", "app.py + routes/*.py", "按 Blueprint 拆分基金、行情、AI、提醒、组合、回测、情绪、导出、持仓", COLORS["green"], COLORS["soft_green"]),
        ("业务服务层", "services/*.py", "基金数据、市场数据、AI、导入解析、持仓存储、晨报、行业、推荐、回测", COLORS["green"], COLORS["soft_green"]),
        ("算法模型层", "quant/* + services/recommend/* + services/sentiment/*", "多因子买卖信号、基金推荐评分、市场情绪、ETF 流向、涨跌停结构", COLORS["purple"], COLORS["soft_purple"]),
        ("基础设施层", "config/cache/ratelimit/store/scheduler", "配置、TTL 缓存、令牌桶限流、MySQL 持久化、后台定时刷新", COLORS["amber"], COLORS["soft_amber"]),
        ("外部能力", "东方财富 / 新浪财经 / OpenAI-Compatible API / MySQL", "实时行情、基金净值、重仓股、板块、贵金属、AI 识别与报告生成", COLORS["red"], COLORS["soft_red"]),
    ]
    box_x, box_w, box_h, gap = 170, 2260, 160, 40
    for index, (name, main, sub, color, fill) in enumerate(layers):
        y = 230 + index * (box_h + gap)
        rounded(draw, (box_x, y, box_x + box_w, y + box_h), fill, color, 24)
        draw.text((box_x + 38, y + 24), name, font=H_FONT, fill=color)
        draw.text((box_x + 360, y + 24), main, font=H_FONT, fill=COLORS["ink"])
        draw.text((box_x + 360, y + 82), sub, font=TEXT_FONT, fill=COLORS["muted"])
        if index < len(layers) - 1:
            mid = box_x + box_w // 2
            draw.line((mid, y + box_h, mid, y + box_h + gap - 8), fill="#8aa0b8", width=4)
            draw.polygon([(mid - 10, y + box_h + gap - 10), (mid + 10, y + box_h + gap - 10), (mid, y + box_h + gap + 6)], fill="#8aa0b8")

    counts: dict[str, int] = {}
    for file in files:
        group = group_for(file)
        counts[group] = counts.get(group, 0) + 1
    y = 1638
    x = 90
    draw.text((x, y), "文件分布：", font=H_FONT, fill=COLORS["ink"])
    x += 170
    for group, count in sorted(counts.items(), key=lambda item: item[0]):
        text = f"{group}: {count}"
        bounds = draw.textbbox((0, 0), text, font=SMALL_FONT)
        draw.text((x, y + 8), text, font=SMALL_FONT, fill=COLORS["muted"])
        x += bounds[2] - bounds[0] + 42
        if x > width - 400:
            x = 260
            y += 34
    image.save(OUT / "00-overall-architecture.png", quality=95)


def draw_file_page(filename: str, title: str, items: list[str], page_no: int, page_count: int, global_offset: int) -> None:
    row_h = 64
    header_h = 190
    footer_h = 74
    width = 3600
    height = max(920, header_h + len(items) * row_h + footer_h)
    image = Image.new("RGB", (width, height), COLORS["bg"])
    draw = ImageDraw.Draw(image)
    draw.text((70, 55), title, font=TITLE_FONT, fill=COLORS["ink"])
    draw.text((72, 124), f"第 {page_no}/{page_count} 页，本页 {len(items)} 个文件。路径来自磁盘扫描，确保不漏文件。", font=H_FONT, fill=COLORS["muted"])

    y = header_h
    rounded(draw, (55, y - 50, width - 55, y), COLORS["panel"], COLORS["line"], 12)
    draw.text((88, y - 38), "序号", font=SMALL_FONT, fill=COLORS["muted"])
    draw.text((170, y - 38), "文件路径", font=SMALL_FONT, fill=COLORS["muted"])
    draw.text((1540, y - 38), "架构层", font=SMALL_FONT, fill=COLORS["muted"])
    draw.text((2070, y - 38), "职责标注", font=SMALL_FONT, fill=COLORS["muted"])

    for local_index, rel in enumerate(items, 1):
        y0 = header_h + (local_index - 1) * row_h + 8
        number = global_offset + local_index
        layer, color, fill = layer_for(rel)
        if local_index % 2 == 0:
            draw.rectangle((55, y0 - 4, width - 55, y0 + row_h - 8), fill="#fbfdff")
        draw.line((65, y0 + row_h - 8, width - 65, y0 + row_h - 8), fill=COLORS["line"], width=1)
        draw.text((84, y0 + 9), f"{number:04d}", font=SMALL_FONT, fill=COLORS["muted"])
        path_lines = wrap(rel, 98)
        draw.text((170, y0 + 4), path_lines[0], font=TEXT_FONT, fill=COLORS["ink"])
        if len(path_lines) > 1:
            draw.text((170, y0 + 31), path_lines[1][:104], font=SMALL_FONT, fill=COLORS["muted"])
        rounded(draw, (1540, y0 + 7, 2020, y0 + 42), fill, color, 16)
        center(draw, (1540, y0 + 7, 2020, y0 + 42), layer, SMALL_FONT, color)
        desc_lines = wrap(describe(rel), 84)
        draw.text((2070, y0 + 4), desc_lines[0], font=TEXT_FONT, fill=COLORS["ink"])
        if len(desc_lines) > 1:
            draw.text((2070, y0 + 31), desc_lines[1][:90], font=SMALL_FONT, fill=COLORS["muted"])
    draw.text((72, height - 50), f"Generated from {ROOT}", font=SMALL_FONT, fill=COLORS["muted"])
    image.save(OUT / filename, quality=95)


def save_file_pages(files: list[str]) -> list[tuple[str, int, list[str]]]:
    groups: list[tuple[str, str, list[str], int]] = [
        ("01-backend-source", "后端源码、配置、算法与测试", [f for f in files if group_for(f) in {"后端源码", "运行缓存"} and f.startswith("src/") and not f.startswith("src/static/") and not f.startswith("src/templates/")], 80),
        ("02-frontend-source", "前端模板、JS 模块与 CSS 样式", [f for f in files if group_for(f) == "前端源码"], 80),
        ("03-docs", "项目文档与文档图片资源", [f for f in files if group_for(f) == "项目文档"], 80),
        ("04-agent-skills", "Agent/技能配置文件", [f for f in files if group_for(f) == "Agent/技能配置"], 90),
        ("05-dev-config", "开发工具配置、缓存与其他辅助文件", [f for f in files if group_for(f) in {"开发工具配置", "根目录/其他"} or f.startswith(".pytest_cache/")], 90),
    ]
    page_results = []
    assigned: list[str] = []
    for prefix, title, items, page_size in groups:
        items = sorted(items, key=lambda item: item.lower())
        if not items:
            continue
        page_count = (len(items) + page_size - 1) // page_size
        for page_index in range(page_count):
            chunk = items[page_index * page_size : (page_index + 1) * page_size]
            filename = f"{prefix}-{page_index + 1:02d}.png"
            draw_file_page(filename, title, chunk, page_index + 1, page_count, page_index * page_size)
            page_results.append((filename, len(chunk), chunk))
        assigned.extend(items)
    missing = sorted(set(files) - set(assigned))
    if missing:
        page_count = (len(missing) + 90 - 1) // 90
        for page_index in range(page_count):
            chunk = missing[page_index * 90 : (page_index + 1) * 90]
            filename = f"99-unclassified-{page_index + 1:02d}.png"
            draw_file_page(filename, "未分类文件兜底页", chunk, page_index + 1, page_count, page_index * 90)
            page_results.append((filename, len(chunk), chunk))
    return page_results


def save_manifest(files: list[str], pages: list[tuple[str, int, list[str]]]) -> None:
    included = [item for _, _, chunk in pages for item in chunk]
    manifest = OUT / "manifest.md"
    with manifest.open("w", encoding="utf-8") as handle:
        handle.write("# 架构图文件覆盖校验\n\n")
        handle.write(f"项目根目录：`{ROOT}`\n\n")
        handle.write(f"扫描文件总数：**{len(files)}**\n\n")
        handle.write("说明：`docs/generated-architecture*` 生成目录未纳入扫描，避免图片生成后递归增加自身文件。\n\n")
        handle.write("## 生成图片\n\n")
        handle.write("- `00-overall-architecture.png`：总体分层架构图\n")
        for name, count, _ in pages:
            handle.write(f"- `{name}`：{count} 个文件\n")
        handle.write("\n## 覆盖校验\n\n")
        handle.write(f"- 图片清单覆盖数：{len(included)}\n")
        handle.write(f"- 重复数：{len(included) - len(set(included))}\n")
        handle.write(f"- 未覆盖数：{len(set(files) - set(included))}\n")
        handle.write("\n## 覆盖明细\n\n")
        for name, count, chunk in pages:
            handle.write(f"### {name} ({count})\n\n")
            for rel in chunk:
                handle.write(f"- `{rel}` — {layer_for(rel)[0]} — {describe(rel)}\n")
            handle.write("\n")


def main() -> None:
    files = scan_files()
    save_overview(files)
    pages = save_file_pages(files)
    save_manifest(files, pages)
    included = [item for _, _, chunk in pages for item in chunk]
    print(f"output={OUT}")
    print(f"files={len(files)} pages={len(pages) + 1}")
    print(f"covered={len(included)} duplicates={len(included) - len(set(included))} missing={len(set(files) - set(included))}")


if __name__ == "__main__":
    main()
