// Drives the editor for screenshots, selected with ?scenario=..., and scrolls the form to
// ?section=tasks|commands|terminals|processes|debugSession.
// The page title is set to "done:<messages sent to the extension>" when finished.
(function () {
  const scenario = new URLSearchParams(location.search).get("scenario");
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const byText = (selector, text) => [...document.querySelectorAll(selector)].find((el) => el.textContent.includes(text));
  const type = (input, value) => { input.value = value; input.dispatchEvent(new Event("input", { bubbles: true })); };
  const choose = (select, index) => { select.selectedIndex = index; select.dispatchEvent(new Event("change", { bubbles: true })); };

  async function buildNewGroup() {
    byText("button", "New").click();
    await wait(50);
    type(document.querySelector("#group-name"), "Build & Debug");
    type(document.querySelector('input[list="folder-choices"]'), "Build");
    byText("button", "Add task").click();
    await wait(50);
    choose(document.querySelector('[data-section="tasks"] select'), 1);
    byText("button", "Add command").click();
    await wait(50);
    type(document.querySelector('[data-section="commands"] input[list]'), "clangd.restart");
    byText("button", "Add debug session").click();
    await wait(50);
    choose(document.querySelector('[data-section="debugSession"] select'), 3);
    type(document.querySelector('[data-section="debugSession"] input'), "2000");
  }

  async function run() {
    await wait(300);
    if (scenario === "edit") {
      byText(".tree-item", "Serve app").click();
    }
    if (scenario === "new" || scenario === "saved") {
      await buildNewGroup();
      if (scenario === "saved") {
        byText("button", "Create").click();
        await wait(300);
      }
    }
    if (scenario === "invalid") {
      byText("button", "New").click();
      await wait(50);
      type(document.querySelector("#group-name"), "Bad args");
      byText("button", "Add command").click();
      await wait(50);
      type(document.querySelectorAll('[data-section="commands"] input')[2], "not json");
      byText("button", "Create").click();
      await wait(100);
    }
    const form = document.querySelector(".form");
    const section = new URLSearchParams(location.search).get("section");
    const target = section && document.querySelector(`[data-section="${section}"]`);
    form?.scrollTo(0, target ? target.offsetTop - form.offsetTop - 16 : 0);
    document.title = "done:" + JSON.stringify(window.harnessLog.filter((m) => m.type !== "ready"));
  }
  window.addEventListener("load", run);
})();
