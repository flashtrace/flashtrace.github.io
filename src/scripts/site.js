// flashtrace website - vanilla JS enhancements. Everything degrades gracefully.
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
        /* private mode etc. - theme just won't persist */
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
    if (!navigator.clipboard) {
      // non-secure context: no Clipboard API, so hide the control entirely
      btn.hidden = true;
      return;
    }
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

  // --- right-rail TOC flow indicator ---
  // A single rail marker whose top/height track the projection of the visible
  // document window onto the TOC entries, so the highlight "flows" across the
  // sections currently on screen instead of snapping to one heading.
  var tocLinks = document.querySelectorAll('.toc a[href^="#"]');
  var docContent = document.querySelector('.doc-content');
  var tocList = document.querySelector('.toc ul');
  if (tocLinks.length && docContent && tocList) {
    var sections = [];
    tocLinks.forEach(function (link) {
      var heading = document.getElementById(link.getAttribute('href').slice(1));
      if (heading) sections.push({ link: link, li: link.parentNode, heading: heading });
    });

    if (sections.length) {
      var marker = document.createElement('span');
      marker.className = 'toc-flow';
      tocList.appendChild(marker);

      var topbarH =
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 56;

      function updateFlow() {
        var scrollY = window.pageYOffset;
        var viewTop = scrollY + topbarH; // top reading line, below the sticky bar
        var viewBottom = scrollY + window.innerHeight;
        var readingH = Math.max(window.innerHeight - topbarH, 1);
        var ulTop = tocList.getBoundingClientRect().top + scrollY;
        var contentBottom = docContent.getBoundingClientRect().bottom + scrollY;

        var barTop = Infinity;
        var barBottom = -Infinity;

        for (var i = 0; i < sections.length; i++) {
          var s = sections[i];
          var secTop = s.heading.getBoundingClientRect().top + scrollY;
          var secBottom =
            i + 1 < sections.length
              ? sections[i + 1].heading.getBoundingClientRect().top + scrollY
              : contentBottom;
          var secH = Math.max(secBottom - secTop, 1);

          var clipTop = Math.max(viewTop, secTop);
          var clipBottom = Math.min(viewBottom, secBottom);
          var visible = clipBottom - clipTop;

          if (visible <= 0) {
            s.link.classList.remove('is-active');
            continue;
          }

          // Project this section's visible slice onto its TOC entry's height.
          var liRect = s.li.getBoundingClientRect();
          var eTop = liRect.top + scrollY;
          var segTop = eTop + ((clipTop - secTop) / secH) * liRect.height;
          var segBottom = eTop + ((clipBottom - secTop) / secH) * liRect.height;
          if (segTop < barTop) barTop = segTop;
          if (segBottom > barBottom) barBottom = segBottom;

          // Binary text highlight: lit while the section holds the top reading
          // line or occupies a meaningful share of the viewport.
          var containsTop = viewTop >= secTop && viewTop < secBottom;
          var frac = visible / Math.min(readingH, secH);
          s.link.classList.toggle('is-active', containsTop || frac >= 0.4);
        }

        if (barBottom > barTop) {
          marker.style.top = barTop - ulTop + 'px';
          marker.style.height = barBottom - barTop + 'px';
          marker.style.opacity = '1';
        } else {
          marker.style.opacity = '0';
        }
      }

      var ticking = false;
      function onScroll() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
          ticking = false;
          updateFlow();
        });
      }

      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll);
      updateFlow();
    }
  }
})();
