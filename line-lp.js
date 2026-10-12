(() => {
  const lpName = document.body.dataset.lpName;
  if (!["study_style", "test_review"].includes(lpName)) return;

  // One handler per document; native links work even if Analytics is unavailable.
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[data-lp-cta]");
    if (!link || typeof window.gtag !== "function") return;
    const ctaType = link.dataset.lpCta;
    if (!["diagnosis", "consultation"].includes(ctaType)) return;
    window.gtag("event", "lp_cta_click", {
      lp_name: lpName,
      cta_type: ctaType,
    });
  });

  const mobileMenu = document.querySelector(".home-mobile-nav");
  mobileMenu?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => mobileMenu.removeAttribute("open"));
  });
})();
