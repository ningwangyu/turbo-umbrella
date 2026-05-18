/**
 * AI对话模块 — SSE流式对话 + 多模态图片识别
 */
import { aiChatHistory, aiChatStreaming, aiPendingImage, $aiFloatBtn, $aiChatPanel, $aiChatMessages, $aiChatInput, $aiChatSend, $aiChatClose, $aiChatClear, $aiChatImgInput, setAiChatHistory, setAiChatStreaming, setAiPendingImage } from './state.js';

function toggleChatPanel() {
    const isOpen = $aiChatPanel.classList.contains("show");
    if (isOpen) {
        $aiChatPanel.classList.remove("show");
        $aiFloatBtn.classList.remove("open");
    } else {
        $aiChatPanel.classList.add("show");
        $aiFloatBtn.classList.add("open");
        $aiChatInput.focus();
    }
}

function renderMarkdown(text) {
    return text
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\n/g, "<br>");
}

function appendChatMessage(role, content) {
    const welcome = $aiChatMessages.querySelector(".ai-chat-welcome");
    if (welcome) welcome.remove();
    const div = document.createElement("div");
    div.className = `ai-msg ai-msg-${role}`;
    if (role === "ai") { div.innerHTML = renderMarkdown(content); } else { div.textContent = content; }
    $aiChatMessages.appendChild(div);
    $aiChatMessages.scrollTop = $aiChatMessages.scrollHeight;
    return div;
}

function appendTypingIndicator() {
    const div = document.createElement("div");
    div.className = "ai-msg-typing";
    div.innerHTML = '<div class="ai-typing-dots"><span></span><span></span><span></span></div>';
    $aiChatMessages.appendChild(div);
    $aiChatMessages.scrollTop = $aiChatMessages.scrollHeight;
    return div;
}

async function sendChatMessage() {
    const text = $aiChatInput.value.trim();
    if ((!text && !aiPendingImage) || aiChatStreaming) return;

    let userContent;
    if (aiPendingImage) {
        const imgBase64 = aiPendingImage.base64;
        const welcome = $aiChatMessages.querySelector(".ai-chat-welcome");
        if (welcome) welcome.remove();
        const msgDiv = document.createElement("div");
        msgDiv.className = "ai-msg ai-msg-user";
        const imgEl = document.createElement("img");
        imgEl.src = imgBase64;
        imgEl.className = "ai-img-preview";
        msgDiv.appendChild(imgEl);
        if (text) { const label = document.createElement("div"); label.textContent = text; label.style.fontSize = "12px"; label.style.marginTop = "4px"; msgDiv.appendChild(label); }
        $aiChatMessages.appendChild(msgDiv);
        $aiChatMessages.scrollTop = $aiChatMessages.scrollHeight;
        userContent = [
            { type: "text", text: text || "请分析这张图片中的内容" },
            { type: "image_url", image_url: { url: imgBase64 } },
        ];
        const previewEl = aiPendingImage.previewEl;
        if (previewEl && previewEl.parentNode) previewEl.remove();
        setAiPendingImage(null);
        aiChatHistory.push({ role: "user", content: userContent });
    } else {
        appendChatMessage("user", text);
        userContent = text;
        aiChatHistory.push({ role: "user", content: text });
    }
    $aiChatInput.value = "";
    $aiChatInput.style.height = "auto";

    setAiChatStreaming(true);
    $aiChatSend.disabled = true;
    const typingEl = appendTypingIndicator();

    try {
        const resp = await fetch("/api/ai/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: aiChatHistory }),
        });
        if (!resp.ok) { const err = await resp.json(); throw new Error(err.error || "请求失败"); }
        typingEl.remove();
        const aiDiv = appendChatMessage("ai", "");
        let fullContent = "";
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                const payload = line.slice(6).trim();
                if (payload === "[DONE]") continue;
                try {
                    const chunk = JSON.parse(payload);
                    if (chunk.content) { fullContent += chunk.content; aiDiv.innerHTML = renderMarkdown(fullContent); $aiChatMessages.scrollTop = $aiChatMessages.scrollHeight; }
                } catch (e) { /* skip */ }
            }
        }
        if (fullContent) { aiChatHistory.push({ role: "assistant", content: fullContent }); }
    } catch (e) {
        typingEl.remove();
        appendChatMessage("ai", "抱歉，发生了错误：" + e.message);
    } finally {
        setAiChatStreaming(false);
        $aiChatSend.disabled = false;
        $aiChatInput.focus();
    }
}

function previewChatImage(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        const imgBase64 = e.target.result;
        if (aiPendingImage && aiPendingImage.previewEl) { aiPendingImage.previewEl.remove(); }
        const container = document.createElement("div");
        container.className = "ai-chat-preview-container";
        container.style.cssText = "position:relative;display:inline-block;margin:4px 0;";
        const img = document.createElement("img");
        img.src = imgBase64;
        img.style.cssText = "max-width:80px;max-height:60px;border-radius:6px;border:1px solid #ddd;";
        container.appendChild(img);
        const removeBtn = document.createElement("span");
        removeBtn.textContent = "✕";
        removeBtn.style.cssText = "position:absolute;top:-4px;right:-4px;background:#999;color:#fff;border-radius:50%;width:16px;height:16px;font-size:10px;display:flex;align-items:center;justify-content:center;cursor:pointer;";
        removeBtn.onclick = function () { container.remove(); setAiPendingImage(null); };
        container.appendChild(removeBtn);
        $aiChatInput.parentNode.insertBefore(container, $aiChatInput);
        setAiPendingImage({ base64: imgBase64, previewEl: container });
        $aiChatInput.focus();
        $aiChatInput.placeholder = "输入问题后按回车发送图片...";
    };
    reader.readAsDataURL(file);
}

export function initAIChat() {
    $aiFloatBtn.addEventListener("click", toggleChatPanel);
    $aiChatClose.addEventListener("click", toggleChatPanel);
    $aiChatSend.addEventListener("click", sendChatMessage);
    $aiChatInput.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } });
    $aiChatInput.addEventListener("input", function () { this.style.height = "auto"; this.style.height = Math.min(this.scrollHeight, 100) + "px"; });
    $aiChatClear.addEventListener("click", function () {
        setAiChatHistory([]);
        $aiChatMessages.innerHTML = '<div class="ai-chat-welcome"><div class="ai-chat-welcome-icon">🤖</div><div>你好！我是AI基金助手</div><div style="margin-top:4px;">可以问我任何基金投资相关的问题</div></div>';
    });
    $aiChatImgInput.addEventListener("change", function () { if (this.files[0]) previewChatImage(this.files[0]); this.value = ""; });
}
