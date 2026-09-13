// Scroll-reveal for elements with .anim-reveal
(function () {
  "use strict";

  var reveals = document.querySelectorAll(".anim-reveal");

  if (!("IntersectionObserver" in window)) {
    reveals.forEach(function (el) { el.classList.add("visible"); });
    return;
  }

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );

  reveals.forEach(function (el) { observer.observe(el); });
})();