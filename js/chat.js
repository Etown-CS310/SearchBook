// Shared Operator chat. Include on any page with: <script src="/js/chat.js"></script>
(function initChat() {
    document.body.insertAdjacentHTML("beforeend", `
        <div class="sb-chat-dock">
            <section class="sb-chat" id="sbChat" aria-label="Chat with the SearchBook operator" hidden>
                <div class="sb-chat-head">Operator</div>
                <div class="sb-chat-log" id="sbChatLog" aria-live="polite"></div>
                <form class="sb-chat-form" id="sbChatForm">
                    <input class="sb-chat-input" id="sbChatInput" type="text" maxlength="500"
                           placeholder="What is DNS?" autocomplete="off" aria-label="Your question">
                    <button class="sb-chat-send" id="sbChatSend" type="submit">Send</button>
                </form>
            </section>
            <button class="sb-chat-toggle" id="sbChatToggle" type="button" aria-expanded="false" aria-controls="sbChat">Ask the operator</button>
        </div>`);

    const toggle = document.getElementById("sbChatToggle");
    const panel = document.getElementById("sbChat");
    const log = document.getElementById("sbChatLog");
    const chatForm = document.getElementById("sbChatForm");
    const input = document.getElementById("sbChatInput");
    const send = document.getElementById("sbChatSend");
    if (!toggle || !panel || !log || !chatForm || !input || !send) return;

    toggle.addEventListener("click", () => {
        panel.hidden = !panel.hidden;
        toggle.setAttribute("aria-expanded", String(!panel.hidden));
    });

    const history = [];   // {role, content} pairs sent to the server each time

    //addMessage functon - TODO

    function addMessage(text, kind) {
        const div = document.createElement("div");
        div.className = "sb-msg " + kind;
        div.textContent = text;   // textContent, not innerHTML, so replies can't inject HTML
        log.appendChild(div);
        log.scrollTop = log.scrollHeight;
    }
 
    toggle.addEventListener("click", () => {
        const open = panel.classList.toggle("open");
        toggle.setAttribute("aria-expanded", open);
        if (open) {
            if (!log.children.length) {
                addMessage("SearchBook operator. Ask me about domains, IP addresses, pings, or your results.", "bot");
            }
            input.focus();
        }
    });
 
    chatForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;
 
        addMessage(text, "user");
        history.push({ role: "user", content: text });
        input.value = "";
        send.disabled = true;
 
        try {
            const res = await fetch("/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: history }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Something went wrong.");
            addMessage(data.reply, "bot");
            history.push({ role: "assistant", content: data.reply });
        } catch (err) {
            addMessage(err.message, "error");
            history.pop();   // drop the failed question so history stays in turn order
        } finally {
            send.disabled = false;
            input.focus();
        }
    });
})();
