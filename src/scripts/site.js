// flashtrace website — vanilla JS enhancements. Everything degrades gracefully.
(function () {
  'use strict';

  // --- theme toggle (initial theme is set inline in <head>) ---
  document.querySelectorAll('.theme-toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem('ft-theme', next);
      } catch (e) {
        /* private mode etc. — theme just won't persist */
      }
    });
  });

  // --- mobile sidebar ---
  var sidebar = document.getElementById('sidebar');
  var toggle = document.querySelector('.sidebar-toggle');
  var backdrop = document.querySelector('.sidebar-backdrop');
  function setSidebar(open) {
    if (!sidebar) return;
    sidebar.classList.toggle('is-open', open);
    if (toggle) toggle.setAttribute('aria-expanded', String(open));
    if (backdrop) backdrop.hidden = !open;
  }
  if (toggle) {
    toggle.addEventListener('click', function () {
      setSidebar(!sidebar.classList.contains('is-open'));
    });
  }
  if (backdrop) {
    backdrop.addEventListener('click', function () {
      setSidebar(false);
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setSidebar(false);
  });

  // --- tabs (scenario switcher + input/output toggles) ---
  document.querySelectorAll('[data-tabs]').forEach(function (container) {
    var tablist = container.querySelector(':scope > [role="tablist"]');
    if (!tablist) return;
    var tabs = Array.prototype.slice.call(tablist.querySelectorAll('[role="tab"]'));
    function select(tab) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
    }
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () {
        select(tab);
      });
      tab.addEventListener('keydown', function (e) {
        var dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        var next = tabs[(i + dir + tabs.length) % tabs.length];
        next.focus();
        select(next);
      });
    });
  });

  // --- copy buttons ---
  function wireCopy(btn, getText) {
    btn.addEventListener('click', function () {
      navigator.clipboard.writeText(getText()).then(function () {
        btn.classList.add('is-copied');
        var label = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(function () {
          btn.classList.remove('is-copied');
          btn.textContent = label;
        }, 1600);
      });
    });
  }
  document.querySelectorAll('.copy-btn[data-copy]').forEach(function (btn) {
    wireCopy(btn, function () {
      return btn.getAttribute('data-copy');
    });
  });
  // add a copy button to every docs code block
  document.querySelectorAll('.doc-content pre').forEach(function (pre) {
    var code = pre.querySelector('code');
    if (!code || !navigator.clipboard) return;
    var btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.type = 'button';
    btn.textContent = 'Copy';
    btn.setAttribute('aria-label', 'Copy code');
    wireCopy(btn, function () {
      return code.textContent;
    });
    pre.appendChild(btn);
  });

  // --- right-rail TOC scrollspy ---
  var tocLinks = document.querySelectorAll('.toc a[href^="#"]');
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var byId = {};
    tocLinks.forEach(function (a) {
      byId[a.getAttribute('href').slice(1)] = a;
    });
    var current = null;
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var link = byId[entry.target.id];
          if (!link) return;
          if (current) current.classList.remove('is-active');
          link.classList.add('is-active');
          current = link;
        });
      },
      { rootMargin: '-56px 0px -70% 0px', threshold: 0 },
    );
    document.querySelectorAll('.doc-content h2[id], .doc-content h3[id]').forEach(function (h) {
      observer.observe(h);
    });
  }
})();
