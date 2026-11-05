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
})();
