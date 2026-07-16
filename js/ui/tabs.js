const tabPanels = document.querySelectorAll(".tab-panel");
const desktopNavBtns = document.querySelectorAll("aside button[data-tab]");
const mobileNavBtns = document.querySelectorAll("#mobile-nav button[data-tab]");
const elHeaderTitle = document.getElementById("header-title");
const elHeaderIcon = document.getElementById("header-icon");

export function initTabs(onSwitchToLibrary) {
  function switchTab(tabId) {
    tabPanels.forEach(p => p.classList.add("hidden"));
    const activePanel = document.getElementById(tabId);
    if (activePanel) activePanel.classList.remove("hidden");

    desktopNavBtns.forEach(btn => {
      if (btn.dataset.tab === tabId) {
        btn.className = "nav-tab-btn flex items-center gap-3 px-4 py-3 bg-secondary-container text-on-secondary-container rounded-xl font-bold transition-all text-sm text-left w-full scale-95 duration-150";
      } else {
        btn.className = "nav-tab-btn flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:bg-surface-variant rounded-xl transition-all text-sm text-left w-full";
      }
    });

    mobileNavBtns.forEach(btn => {
      if (btn.dataset.tab === tabId) {
        btn.className = "nav-tab-btn text-primary-container font-bold border-b-2 border-primary-container pb-2 text-sm whitespace-nowrap";
      } else {
        btn.className = "nav-tab-btn text-on-surface-variant font-medium pb-2 text-sm whitespace-nowrap";
      }
    });

    if (tabId === "tab-search") {
      if (elHeaderTitle) elHeaderTitle.textContent = "film_indirme.";
      if (elHeaderIcon) elHeaderIcon.textContent = "download";
    } else if (tabId === "tab-library") {
      if (elHeaderTitle) elHeaderTitle.textContent = "kütüphane_";
      if (elHeaderIcon) elHeaderIcon.textContent = "movie_filter";
      if (onSwitchToLibrary) onSwitchToLibrary();
    }
  }

  desktopNavBtns.forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
  
  mobileNavBtns.forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // Default tab
  switchTab("tab-library");
}
