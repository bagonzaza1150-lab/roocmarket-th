window.ROOC_SUPABASE = {
  url: "https://qgzkoraxaszvdxvasgqz.supabase.co",
  anonKey: "sb_publishable_KS5z7dIlRP7xQJ8tgnwyGg_K_eWDuoA",
  itemBucket: "item-images",
  listingBucket: "listing-images",
  adminEmails: ["bagonzaza1150@gmail.com"],
  adminUserIds: [],
  adminDiscordIds: []
};

(() => {
  const config = window.ROOC_SUPABASE;
  const canUseSupabase = Boolean(config.url && config.anonKey && window.supabase);
  const supabaseClient = canUseSupabase ? window.supabase.createClient(config.url, config.anonKey) : null;
  window.roocSupabaseClient = supabaseClient;

  // ฟังก์ชันกลางสำหรับโหลดไอคอนจากฐานข้อมูล (ใช้กับทุกหน้า)
  window.ROOC_LOAD_ICONS = async function() {
    if (!supabaseClient) return;
    try {
      const { data, error } = await supabaseClient
        .from('marketplace_settings')
        .select('key, value')
        .in('key', ['icon_site-logo', 'icon_cat-mvp', 'icon_cat-acc', 'icon_cat-fashion', 'icon_dash-sell', 'icon_dash-buy', 'icon_dash-service', 'icon_dash-account']);
      
      if (error || !data || data.length === 0) return;
      
      const iconMap = {};
      data.forEach(row => {
        iconMap[row.key.replace('icon_', '')] = row.value;
      });

      const addCacheBuster = (url) => {
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}t=${Date.now()}`;
      };

      let updatedCount = 0;

      // 1. อัปเดต Logo
      if (iconMap['site-logo']) {
        const logoUrl = addCacheBuster(iconMap['site-logo']);
        document.querySelectorAll('img').forEach(img => {
          if (img.src.includes('rooc-icon') || img.closest('.brand-mark') || img.closest('.brand') || img.id === 'storeAvatar') {
            img.src = logoUrl;
            updatedCount++;
          }
        });
      }

      // 2. อัปเดต Category Icons
      const catPatterns = {
        'cat-mvp': ['mvp-c.png', 'mvp'],
        'cat-acc': ['accessories-a.png', 'acc'],
        'cat-fashion': ['fashion-c.png', 'fashion']
      };

      document.querySelectorAll('img').forEach(img => {
        const src = img.src || '';
        if (src.includes('rooc-icon')) return;
        Object.entries(catPatterns).forEach(([key, patterns]) => {
          if (iconMap[key] && patterns.some(p => src.includes(p))) {
            img.src = addCacheBuster(iconMap[key]);
            updatedCount++;
          }
        });
      });

      // 3. อัปเดต Dashboard Icons (แก้ปัญหา SVG ไม่เปลี่ยน)
      const dashboardMapping = [
        { text: 'ประกาศขาย', key: 'dash-sell' },
        { text: 'ประกาศรับซื้อ', key: 'dash-buy' },
        { text: 'รับจ้างลงดัน', key: 'dash-service' },
        { text: 'สถานะบัญชี', key: 'dash-account' }
      ];

      dashboardMapping.forEach(item => {
        if (iconMap[item.key]) {
          const url = addCacheBuster(iconMap[item.key]);
          // ค้นหาข้อความในหน้าเว็บ
          document.querySelectorAll('.quota-details span, .stat-label').forEach(span => {
            if (span.textContent.trim() === item.text) {
              const quotaItem = span.closest('.quota-item');
              if (quotaItem) {
                const iconBox = quotaItem.querySelector('.quota-icon-box');
                if (iconBox) {
                  // ขยายไอคอนให้ใหญ่ขึ้นเป็น 64px
                  iconBox.innerHTML = `<img src="${url}" style="width: 64px; height: 64px; object-fit: contain;" />`;
                  // นำพื้นหลังและกรอบออกเพื่อให้ไอคอนลอยเด่น
                  iconBox.style.background = 'none';
                  iconBox.style.boxShadow = 'none';
                  iconBox.style.border = 'none';
                  iconBox.style.width = 'auto';
                  iconBox.style.height = 'auto';
                  iconBox.style.marginRight = '10px';
                  updatedCount++;
                }
              }
            }
          });
        }
      });

      // 4. อัปเดต Preview ในหน้า Admin (ถ้ามี)
      const adminPreviews = {
        'site-logo': 'preview-site-logo',
        'cat-mvp': 'preview-cat-mvp',
        'cat-acc': 'preview-cat-acc',
        'cat-fashion': 'preview-cat-fashion',
        'dash-sell': 'preview-dash-sell',
        'dash-buy': 'preview-dash-buy',
        'dash-service': 'preview-dash-service',
        'dash-account': 'preview-dash-account'
      };

      Object.entries(adminPreviews).forEach(([key, id]) => {
        if (iconMap[key]) {
          const el = document.getElementById(id);
          if (el) {
            const url = addCacheBuster(iconMap[key]);
            if (el.tagName === 'IMG') el.src = url;
            else el.innerHTML = `<img src="${url}" style="max-width: 24px; max-height: 24px;" />`;
            updatedCount++;
          }
        }
      });
      
      console.log(`ROOC: Dynamic icons updated ${updatedCount} elements`);
    } catch (err) {
      console.warn('ROOC: Failed to load dynamic icons', err);
    }
  };
  let publicListings = [];
  let soldListings = [];
  const listingsPerPage = 6;
  const listingCacheMs = 45000;
  const soldListingCacheMs = 120000;
  const listingSelectColumns = [
    "id",
    "user_id",
    "listing_type",
    "category",
    "item_name",
    "title",
    "image_url",
    "image_urls",
    "character_name",
    "seller_name",
    "seller_avatar_url",
    "seller_discord_id",
    "seller_is_premium",
    "price_text",
    "server_name",
    "contact",
    "description",
    "middleman",
    "offers_enabled",
    "ready_today",
    "facebook_url",
    "active",
    "sale_status",
    "expires_at",
    "card_background",
    "created_at",
    "updated_at"
  ].join(",");
  // สำหรับกรณีที่ยังไม่ได้อัปเดตระบบ "รับซื้อ/รับจ้าง" (listing_type) และ "เสนอราคา" (offers_enabled)
  const storeLegacyListingSelectColumns = listingSelectColumns
    .split(",")
    .filter((column) => column !== "listing_type" && column !== "offers_enabled" && column !== "facebook_url")
    .join(",");

  // สำหรับกรณีที่อัปเดตระบบ "รับซื้อ/รับจ้าง" แล้ว แต่ยังไม่ได้เพิ่มคอลัมน์ "facebook_url"
  const noFacebookListingSelectColumns = listingSelectColumns
    .split(",")
    .filter((column) => column !== "facebook_url")
    .join(",");
  let currentListingPage = 1;
  let activeListingType = "sell";
  let refreshCooldownTimer = null;
  let refreshCooldownEndsAt = 0;
  let accountListingEnabled = true;
  const fallbackServers = [
    "Prontera 1", "Prontera 2", "Prontera 3", "Prontera 4", "Prontera 5",
    "Prontera 6", "Prontera 7", "Prontera 8", "Prontera 9", "Prontera 10",
    "Geffen 1", "Geffen 2", "Geffen 3", "Geffen 4", "Geffen 5",
    "Geffen 6", "Geffen 7", "Geffen 8", "Geffen 9", "Geffen 10"
  ];

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function initFloatingElements() {
    const container = document.querySelector("#floatingElements");
    if (!container) return;

    // รายการใบไม้ Pixel Art แบบต่างๆ
    const leafImages = [
      "assets/leaf-pixel-green.png",
      "assets/leaf-pixel-orange.png",
      "assets/leaf-pixel-yellow.png"
    ];

    const count = 20; // เพิ่มจำนวนใบไม้เล็กน้อยเพื่อให้ดูเต็มขึ้น

    for (let i = 0; i < count; i++) {
      const item = document.createElement("img");
      item.src = leafImages[Math.floor(Math.random() * leafImages.length)];
      item.className = "floating-item";
      
      // ปรับขนาดให้ใหญ่ขึ้นเห็นชัดเจน (40px - 70px)
      const size = Math.random() * 30 + 40;
      item.style.width = `${size}px`;
      item.style.height = "auto";
      
      // สุ่มตำแหน่งเริ่มต้น (กระจายทั่วหน้าจอ)
      item.style.left = `${Math.random() * 100}%`;
      item.style.top = `${Math.random() * 100}%`;
      
      // สุ่มความเร็วและจังหวะการร่วง
      const duration = Math.random() * 15 + 20; // 20s - 35s
      const delay = Math.random() * -35; // สุ่มให้เริ่มไม่พร้อมกัน
      item.style.animationDuration = `${duration}s`;
      item.style.animationDelay = `${delay}s`;
      
      // สุ่มความเร็วในการแกว่ง (ใช้คุณสมบัติ CSS variable ถ้าต้องการปรับแต่งเพิ่ม)
      item.style.opacity = "0"; // เริ่มต้นที่ 0 (CSS จะจัดการเฟดอินเอง)
      
      container.appendChild(item);
    }
  }

  function initTheme() {
    const savedTheme = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const activeTheme = savedTheme || (prefersDark ? "dark" : "light");
    const themeToggle = document.querySelector("#themeToggle");

    document.documentElement.dataset.theme = activeTheme;
    if (!themeToggle) return;

    themeToggle.checked = activeTheme === "dark";
    if (themeToggle.dataset.themeBound === "true") return;

    themeToggle.dataset.themeBound = "true";
    themeToggle.addEventListener("change", () => {
      const nextTheme = themeToggle.checked ? "dark" : "light";
      document.documentElement.dataset.theme = nextTheme;
      localStorage.setItem("theme", nextTheme);
    });
  }



  function getSupabaseClient() {
    return supabaseClient;
  }

  function getDescriptionParts(value, maxLength = 120) {
    const text = String(value || "").trim();
    const hasLongToken = text.split(/\s+/).some((part) => part.length > 34);
    const shouldTruncate = text.length > maxLength || hasLongToken;
    if (!shouldTruncate) {
      return { shortText: text, fullText: text, truncated: false };
    }
    const limit = hasLongToken && text.length <= maxLength ? 72 : maxLength;
    return {
      shortText: `${text.slice(0, limit).trim()}...`,
      fullText: text,
      truncated: true
    };
  }

  function toggleListingDescription(button) {
    const card = button?.closest(".listing-card");
    const description = card?.querySelector(".listing-description");
    if (!description) return;

    const expanded = button.dataset.expanded === "true";
    description.textContent = expanded ? description.dataset.short || "" : description.dataset.full || "";
    button.textContent = expanded ? "ดูเพิ่มเติม" : "ย่อข้อความ";
    button.dataset.expanded = String(!expanded);
    button.setAttribute("aria-expanded", String(!expanded));
  }

  window.toggleListingDescription = toggleListingDescription;

  async function fetchCachedJson(cacheKey, url, ttlMs, force = false) {
    if (!force) {
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
        if (cached && Date.now() - cached.savedAt < ttlMs) return cached.data;
      } catch (_error) {
        localStorage.removeItem(cacheKey);
      }
    }

    const response = await fetch(url, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`
      }
    });

    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), data }));
    } catch (_error) {
      localStorage.removeItem(cacheKey);
    }
    return data;
  }

  async function fetchPublicListings(force = false) {
    try {
      return await fetchCachedJson(
        "rooc-public-listings-v3",
        `${config.url}/rest/v1/marketplace_listings?select=${listingSelectColumns}&active=eq.true&sale_status=neq.deleted&sale_status=neq.sold&sale_status=neq.closed&order=created_at.desc&limit=1000`,
        listingCacheMs,
        force
      );
    } catch (error) {
      console.warn("Facebook column not ready, trying without facebook_url...");
      try {
        return await fetchCachedJson(
          "rooc-public-listings-v3-no-fb",
          `${config.url}/rest/v1/marketplace_listings?select=${noFacebookListingSelectColumns}&active=eq.true&sale_status=neq.deleted&sale_status=neq.sold&sale_status=neq.closed&order=created_at.desc&limit=1000`,
          listingCacheMs,
          force
        );
      } catch (legacyError) {
        console.warn("ROOC listing_type/offers columns not ready, using legacy listing query:", legacyError);
        return fetchCachedJson(
          "rooc-public-listings-legacy-v1",
          `${config.url}/rest/v1/marketplace_listings?select=${storeLegacyListingSelectColumns}&active=eq.true&sale_status=neq.deleted&sale_status=neq.sold&sale_status=neq.closed&order=created_at.desc&limit=1000`,
          listingCacheMs,
          force
        );
      }
    }
  }

  async function fetchSoldListings(force = false) {
    try {
      return await fetchCachedJson(
        "rooc-sold-listings-v2",
        `${config.url}/rest/v1/marketplace_listings?select=${listingSelectColumns}&active=eq.false&sale_status=eq.sold&order=updated_at.desc`,
        soldListingCacheMs,
        force
      );
    } catch (error) {
      console.warn("Facebook column not ready in sold, trying without facebook_url...");
      try {
        return await fetchCachedJson(
          "rooc-sold-listings-v2-no-fb",
          `${config.url}/rest/v1/marketplace_listings?select=${noFacebookListingSelectColumns}&active=eq.false&sale_status=eq.sold&order=updated_at.desc`,
          soldListingCacheMs,
          force
        );
      } catch (legacyError) {
        console.warn("ROOC sold listing_type/offers columns not ready, using legacy sold query:", legacyError);
        return fetchCachedJson(
          "rooc-sold-listings-legacy-v1",
          `${config.url}/rest/v1/marketplace_listings?select=${storeLegacyListingSelectColumns}&active=eq.false&sale_status=eq.sold&order=updated_at.desc`,
          soldListingCacheMs,
          force
        );
      }
    }
  }

  async function fetchSiteSettings() {
    const response = await fetch(`${config.url}/rest/v1/marketplace_site_settings?select=key,value&key=eq.support_sidebar`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`
      }
    });

    if (!response.ok) throw new Error(await response.text());
    const rows = await response.json();
    return rows?.[0]?.value || {};
  }

  async function fetchActiveServers() {
    const response = await fetch(`${config.url}/rest/v1/marketplace_servers?select=name&active=eq.true&order=sort_order.asc,name.asc`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`
      }
    });

    if (!response.ok) throw new Error(await response.text());
    const rows = await response.json();
    return rows.map((row) => row.name).filter(Boolean);
  }

  function parsePrice(value) {
    const number = Number(normalizePriceText(value));
    return Number.isFinite(number) ? number : 0;
  }

  function normalizePriceText(value) {
    const cleaned = String(value || "")
      .replace(/,/g, "")
      .replace(/[^\d.]/g, "");
    const [whole = "", ...fractionParts] = cleaned.split(".");
    const normalized = fractionParts.length ? `${whole || "0"}.${fractionParts.join("")}` : whole;
    return normalized.replace(/^0+(?=\d)/, "") || "";
  }

  function formatListingPrice(value) {
    const price = parsePrice(value);
    return price > 0 ? price.toLocaleString("th-TH", { maximumFractionDigits: 2 }) : "0";
  }

  function compareListingNewest(a, b) {
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  }

  function comparePremiumPriority(a, b) {
    return Number(Boolean(b.seller_is_premium)) - Number(Boolean(a.seller_is_premium));
  }

  function compareListingPrice(a, b, direction) {
    const priceA = parsePrice(a.price_text);
    const priceB = parsePrice(b.price_text);
    const hasPriceA = priceA > 0;
    const hasPriceB = priceB > 0;

    if (hasPriceA !== hasPriceB) return hasPriceA ? -1 : 1;
    if (!hasPriceA && !hasPriceB) {
      return compareListingNewest(a, b);
    }

    const priceDiff = direction === "asc" ? priceA - priceB : priceB - priceA;
    if (priceDiff !== 0) return priceDiff;
    return compareListingNewest(a, b);
  }

  function getContactProfileUrl(contact) {
    const value = String(contact || "").trim();
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    if (/^\d{16,22}$/.test(value)) return `https://discord.com/users/${value}`;
    const discordUserMatch = value.match(/(?:discord(?:app)?\.com\/users\/)(\d{16,22})/i);
    if (discordUserMatch) return `https://discord.com/users/${discordUserMatch[1]}`;
    return "";
  }

  function getListingProfileUrl(listing) {
    const discordId = getListingDiscordId(listing);
    if (discordId) return `https://discord.com/users/${discordId}`;
    return getContactProfileUrl(listing.contact);
  }

  function getDiscordIdFromContact(contact) {
    const value = String(contact || "").trim();
    if (/^\d{16,22}$/.test(value)) return value;
    return value.match(/(?:discord(?:app)?\.com\/users\/)(\d{16,22})/i)?.[1] || "";
  }

  function getListingDiscordId(listing) {
    const discordId = String(listing.seller_discord_id || "").trim();
    if (/^\d{16,22}$/.test(discordId)) return discordId;
    return getDiscordIdFromContact(listing.contact);
  }

  function getFilterControls() {
    return {
      search: document.querySelector("#marketSearch"),
      heroServer: document.querySelector("#heroServerFilter"),
      sidebarServer: document.querySelector("#sidebarServerFilter"),
      category: document.querySelector("#categoryFilter"),
      price: document.querySelector("#priceFilter"),
      sort: document.querySelector("#sortFilter"),
      refresh: document.querySelector("#refreshListingsButton"),
      middleman: document.querySelector("#middlemanFilter"),
      ready: document.querySelector("#readyFilter"),
      reset: document.querySelector("#resetFilters"),
      typeTabs: Array.from(document.querySelectorAll(".listing-type-tabs [data-listing-type]")),
      tabs: Array.from(document.querySelectorAll(".market-tabs [data-category]"))
    };
  }

  function getActiveFilters() {
    const controls = getFilterControls();
    const rawCategory = controls.category?.value || "all";
    return {
      search: normalizeSearch(controls.search?.value || ""),
      server: controls.sidebarServer?.value || controls.heroServer?.value || "ทั้งหมด",
      category: activeListingType === "service" || rawCategory === "account" && (!accountListingEnabled || activeListingType === "buy") ? "all" : rawCategory,
      listingType: activeListingType,
      price: controls.price?.value || "all",
      sort: controls.sort?.value || "newest",
      middleman: Boolean(controls.middleman?.checked),
      ready: Boolean(controls.ready?.checked)
    };
  }

  function setRefreshCooldown(seconds = 10) {
    const controls = getFilterControls();
    const button = controls.refresh;
    if (!button) return;

    refreshCooldownEndsAt = Date.now() + (seconds * 1000);
    window.clearInterval(refreshCooldownTimer);

    const updateCooldown = () => {
      const remaining = Math.ceil((refreshCooldownEndsAt - Date.now()) / 1000);
      if (remaining <= 0) {
        window.clearInterval(refreshCooldownTimer);
        refreshCooldownTimer = null;
        button.disabled = false;
        button.classList.remove("is-cooling-down");
        button.setAttribute("aria-label", "รีเฟรชสินค้า");
        button.title = "รีเฟรชสินค้า";
        return;
      }

      button.disabled = true;
      button.classList.add("is-cooling-down");
      button.setAttribute("aria-label", `รีเฟรชได้อีกครั้งใน ${remaining} วินาที`);
      button.title = `รีเฟรชได้อีกครั้งใน ${remaining} วินาที`;
    };

    updateCooldown();
    refreshCooldownTimer = window.setInterval(updateCooldown, 1000);
  }

  function listingMatchesSearch(listing, search) {
    if (!search) return true;
    const categoryNames = {
      mvp: "mvp cards card การ์ด",
      accessories: "accessories accessory ประดับ",
      fashion: "fashion แฟชั่น",
      account: "account บัญชี",
      dungeon: "dungeon ดัน รับจ้างลงดัน"
    };
    const typeText = listing.listing_type === "buy" ? "รับซื้อ buy" : listing.listing_type === "service" ? "รับจ้างลงดัน service dungeon" : "ขาย sell";
    return [
      typeText,
      listing.title,
      listing.item_name,
      listing.character_name,
      listing.description,
      listing.server_name,
      listing.contact,
      listing.seller_name,
      listing.price_text,
      categoryNames[listing.category]
    ].some((value) => normalizeSearch(value).includes(search));
  }

  function normalizeSearch(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function getListingImages(listing) {
    const gallery = Array.isArray(listing.image_urls) ? listing.image_urls.filter(Boolean) : [];
    return gallery.length ? gallery : [listing.image_url || (listing.category === "dungeon" ? "assets/site-icons/rooc-icon-192.png" : "assets/category-icons/mvp-c.png")];
  }

  function listingMatchesPrice(listing, priceFilter) {
    if (priceFilter === "all") return true;
    const price = parsePrice(listing.price_text);
    if (priceFilter === "under-1000") return price > 0 && price < 1000;
    if (priceFilter === "1000-3000") return price >= 1000 && price <= 3000;
    if (priceFilter === "over-3000") return price > 3000;
    return true;
  }

  function getFilteredListings() {
    const filters = getActiveFilters();
    const filtered = publicListings.filter((listing) => {
      if (!accountListingEnabled && listing.category === "account") return false;
      if ((listing.listing_type || "sell") !== filters.listingType) return false;
      if (!listingMatchesSearch(listing, filters.search)) return false;
      if (filters.server !== "ทั้งหมด" && listing.server_name !== filters.server) return false;
      if (filters.category !== "all" && listing.category !== filters.category) return false;
      if (!listingMatchesPrice(listing, filters.price)) return false;
      if (filters.middleman && !listing.middleman) return false;
      if (filters.ready && !listing.ready_today) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      const premiumOrder = comparePremiumPriority(a, b);
      if (premiumOrder !== 0) return premiumOrder;

      if (filters.sort === "price-low") return compareListingPrice(a, b, "asc");
      if (filters.sort === "price-high") return compareListingPrice(a, b, "desc");
      return compareListingNewest(a, b);
    });
  }

  function syncCategoryUi(category) {
    const controls = getFilterControls();
    const normalizedCategory = category === "account" && !accountListingEnabled ? "all" : category;
    if (controls.category) controls.category.value = normalizedCategory;
    if ((activeListingType === "service" || (activeListingType === "buy" && normalizedCategory === "account")) && controls.category) {
      controls.category.value = "all";
    }
    if (controls.category) {
      Array.from(controls.category.options).forEach((option) => {
        const isAccount = option.value === "account";
        option.hidden = isAccount && !accountListingEnabled;
        option.disabled = activeListingType === "service" || (isAccount && (!accountListingEnabled || activeListingType === "buy"));
      });
    }
    controls.tabs.forEach((button) => {
      const isAccount = button.dataset.category === "account";
      button.hidden = isAccount && !accountListingEnabled;
      button.classList.toggle("is-active", button.dataset.category === normalizedCategory);
      button.disabled = activeListingType === "service" || (isAccount && (!accountListingEnabled || activeListingType === "buy"));
    });
  }

  function syncListingTypeUi(type) {
    activeListingType = type === "buy" ? "buy" : type === "service" ? "service" : "sell";
    const controls = getFilterControls();
    controls.typeTabs.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.listingType === activeListingType);
    });
    if (activeListingType === "service" || (activeListingType === "buy" && controls.category?.value === "account")) {
      syncCategoryUi("all");
    } else {
      syncCategoryUi(controls.category?.value || "all");
    }
  }

  function syncServerUi(value, source) {
    const controls = getFilterControls();
    if (source !== controls.heroServer && controls.heroServer) controls.heroServer.value = value;
    if (source !== controls.sidebarServer && controls.sidebarServer) controls.sidebarServer.value = value;
  }

  function populateServerSelects(servers) {
    const activeServers = servers?.length ? servers : fallbackServers;
    const controls = getFilterControls();
    [controls.heroServer, controls.sidebarServer].forEach((select) => {
      if (!select) return;
      const selected = select.value || "ทั้งหมด";
      select.innerHTML = [
        '<option>ทั้งหมด</option>',
        ...activeServers.map((server) => `<option>${escapeHtml(server)}</option>`)
      ].join("");
      select.value = activeServers.includes(selected) ? selected : "ทั้งหมด";
    });

  }

  function renderCounts(listings) {
    const counts = { mvp: 0, accessories: 0, fashion: 0, account: 0 };
    const visibleListings = listings.filter((listing) => accountListingEnabled || listing.category !== "account");
    visibleListings.filter((listing) => (listing.listing_type || "sell") === activeListingType).forEach((listing) => {
      if (counts[listing.category] !== undefined) counts[listing.category] += 1;
    });

    const targets = {
      mvp: document.querySelector("#mvpListingCount"),
      accessories: document.querySelector("#accessoriesListingCount"),
      fashion: document.querySelector("#fashionListingCount"),
      account: document.querySelector("#accountListingCount")
    };
    Object.entries(targets).forEach(([category, target]) => {
      if (target) target.textContent = counts[category].toLocaleString("th-TH");
    });

    const sellTotal = listings.filter((listing) => (listing.listing_type || "sell") === "sell" && listing.sale_status !== "deleted" && listing.sale_status !== "sold").length;
    const buyTotal = listings.filter((listing) => (listing.listing_type || "sell") === "buy" && listing.sale_status !== "deleted" && listing.sale_status !== "sold").length;
    const serviceTotal = listings.filter((listing) => (listing.listing_type || "sell") === "service" && listing.sale_status !== "deleted" && listing.sale_status !== "sold").length;
    const sellTarget = document.querySelector("#totalSellListingCount");
    const buyTarget = document.querySelector("#totalBuyListingCount");
    const serviceTarget = document.querySelector("#totalServiceListingCount");
    if (sellTarget) sellTarget.textContent = sellTotal.toLocaleString("th-TH");
    if (buyTarget) buyTarget.textContent = buyTotal.toLocaleString("th-TH");
    if (serviceTarget) serviceTarget.textContent = serviceTotal.toLocaleString("th-TH");
  }

  function renderListingSkeletons() {
    const grid = document.querySelector("#latestListingGrid");
    if (!grid) return;
    const skeletons = Array.from({ length: 6 }, () => `
      <div class="skeleton-card">
        <div class="skeleton skeleton-image"></div>
        <div class="skeleton skeleton-text"></div>
        <div class="skeleton skeleton-text short"></div>
        <div class="skeleton skeleton-btn"></div>
      </div>
    `).join("");
    grid.innerHTML = skeletons;
  }

  function renderListingCards(listings, isFiltered = false) {
    const grid = document.querySelector("#latestListingGrid");
    const emptyState = document.querySelector("#latestEmptyState");
    const pagination = document.querySelector("#listingPagination");
    if (!grid || !emptyState) return;

    if (!listings.length) {
      grid.innerHTML = "";
      if (pagination) {
        pagination.hidden = true;
        pagination.innerHTML = "";
      }
      emptyState.hidden = false;
      const typeLabel = activeListingType === "buy" ? "ประกาศรับซื้อ" : activeListingType === "service" ? "ประกาศรับจ้างลงดัน" : "ประกาศขาย";
      emptyState.querySelector("h3").textContent = isFiltered ? `ไม่พบ${typeLabel}ที่ตรงกับตัวกรอง` : `ยังไม่มี${typeLabel}`;
      emptyState.querySelector("p").textContent = isFiltered ? "ลองล้างตัวกรองหรือเปลี่ยนคำค้นหา" : `เมื่อมีผู้ใช้ลง${typeLabel} รายการล่าสุดจะแสดงในส่วนนี้`;
      return;
    }

    const totalPages = Math.max(1, Math.ceil(listings.length / listingsPerPage));
    currentListingPage = Math.min(Math.max(currentListingPage, 1), totalPages);
    const pageStart = (currentListingPage - 1) * listingsPerPage;
    const pageListings = listings.slice(pageStart, pageStart + listingsPerPage);

    // Reset animation by clearing grid first if needed
    grid.innerHTML = "";
    
    const cardsHtml = pageListings.map((listing, index) => {
      const title = listing.title || listing.item_name || "ประกาศขาย";
      const sellerSoldCounts = soldListings.reduce((acc, item) => {
        const uid = item.user_id;
        if (uid) acc[uid] = (acc[uid] || 0) + 1;
        return acc;
      }, {});
      const soldCount = sellerSoldCounts[listing.user_id] || 0;
      const trustBadge = soldCount > 0 ? `<div class="seller-trust-badge"><svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><path d="M12 2l2.4 7.2h7.6l-6 4.8 2.4 7.2-6-4.8-6 4.8 2.4-7.2-6-4.8h7.6z"/></svg> สำเร็จ ${soldCount} รายการ</div>` : "";
      const listingType = listing.listing_type || "sell";
      const isServiceListing = listingType === "service";
      const mediaClass = listing.category === "mvp" ? "item-media card-media" : listing.category === "account" ? "item-media account-listing-media" : "item-media";
      const listingImages = getListingImages(listing);
      const contact = listing.contact || "";
      const profileUrl = getListingProfileUrl(listing);
      const discordId = getListingDiscordId(listing);
      const sellerName = listing.seller_name || "ผู้ขาย ROOC";
      const sellerAvatar = listing.seller_avatar_url || "assets/category-icons/account-b.png";
      const galleryData = listing.category === "account"
        ? ` data-account-gallery="${escapeHtml(encodeURIComponent(JSON.stringify(listingImages)))}" data-account-title="${escapeHtml(title)}"`
        : "";
      const badges = [
                `<span class="${listingType === "buy" ? "buy" : listingType === "service" ? "verified" : "fast"} shine">${listingType === "buy" ? "รับซื้อ" : listingType === "service" ? "รับจ้าง" : "ขาย"}</span>`,
        `<span class="shine">${escapeHtml(listing.server_name || "ทั้งหมด")}</span>`,
        listing.ready_today ? 
          '<span class="fast pulse">Fast Deal</span>' : "",
        listing.category === "mvp" ? 
          '<span class="mvp shine">MVP</span>' : "",
        listing.category === "dungeon" ? 
          '<span class="mvp shine">Dungeon</span>' : ""
      ].filter(Boolean).join("");
      const characterNameText = listing.character_name ? `ตัวละคร: ${listing.character_name}` : "";
      const middlemanText = listing.middleman ? "รองรับ Middleman" : "";
      const description = listing.description || "";
      const descriptionParts = getDescriptionParts(description);

      return `
        <article class="listing-card${isServiceListing ? " service-listing-card" : ""}${listing.card_background && listing.card_background !== 'default' ? " " + listing.card_background : ""}">
          ${isServiceListing ? "" : `<div class="${mediaClass}"${galleryData}>
            <img src="${escapeHtml(listingImages[0])}" alt="" loading="lazy" decoding="async" />
            ${listing.category === "account" && listingImages.length > 1 ? `
              <div class="account-gallery-count">${listingImages.length} รูป</div>
              <div class="account-gallery-strip">
                ${listingImages.slice(0, 5).map((src) => `<span><img src="${escapeHtml(src)}" alt="" loading="lazy" decoding="async" /></span>`).join("")}
              </div>
            ` : ""}
          </div>`}
          <div class="listing-seller">
            <img src="${escapeHtml(sellerAvatar)}" alt="" loading="lazy" decoding="async" />
		            <a href="store.html?id=${encodeURIComponent(listing.user_id)}" class="seller-store-link" title="ไปที่หน้าร้านค้า" onclick="event.stopPropagation();" style="display: flex; align-items: center; gap: 4px; min-width: 0; overflow: hidden;">
	              <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(sellerName)}</span>
	              ${listing.seller_is_premium ? '<strong title="Premium" style="color: #f59e0b; font-size: 14px; text-shadow: 0 0 8px rgba(245, 158, 11, 0.3); flex-shrink: 0;">♛</strong>' : ""}
	            </a>
            ${trustBadge}
          </div>
          <div class="listing-meta">${badges}</div>
          <h3>${escapeHtml(title)}</h3>
          ${characterNameText ? `<p class="listing-character-name">${escapeHtml(characterNameText)}</p>` : ""}
          ${middlemanText ? `<p class="listing-middleman-status">${escapeHtml(middlemanText)}</p>` : ""}
          <p class="listing-description" data-short="${escapeHtml(descriptionParts.shortText)}" data-full="${escapeHtml(descriptionParts.fullText)}">${escapeHtml(descriptionParts.shortText)}</p>
          ${descriptionParts.truncated ? '<button class="description-toggle" type="button" data-description-toggle aria-expanded="false" onclick="event.stopPropagation(); window.toggleListingDescription?.(this)">ดูเพิ่มเติม</button>' : ""}
          <div class="price-row">
            <div class="price-display">
              <span>฿</span>
              <strong>${formatListingPrice(listing.price_text)}</strong>
            </div>
            <div class="listing-card-actions">
              ${listing.facebook_url ? `<a href="${escapeHtml(listing.facebook_url)}" target="_blank" rel="noopener" class="seller-facebook-btn" title="เปิด Facebook ผู้ขาย" onclick="event.stopPropagation();">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                  <path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c5.05-.5 9-4.76 9-9.95z"/>
                </svg>
              </a>` : ""}
              ${listing.offers_enabled ? `<button class="btn btn-small btn-light offer-button" type="button" data-offer-listing-id="${escapeHtml(listing.id)}" data-offer-title="${escapeHtml(title)}" data-offer-price="${escapeHtml(listing.price_text)}">เสนอราคา</button>` : ""}
              <button class="btn btn-small contact-seller-button" type="button" data-title="${escapeHtml(title)}" data-contact="${escapeHtml(contact)}" data-profile-url="${escapeHtml(profileUrl)}" data-discord-id="${escapeHtml(discordId)}" data-seller-name="${escapeHtml(sellerName)}">${listingType === "buy" ? "ติดต่อผู้รับซื้อ" : listingType === "service" ? "ติดต่อผู้รับจ้าง" : "ติดต่อผู้ขาย"}</button>
            </div>
          </div>
        </article>
      `;
    }).join("");

    grid.innerHTML = cardsHtml;
    emptyState.hidden = true;
    renderListingPagination(listings.length, totalPages);
  }

  function renderListingPagination(totalItems, totalPages) {
    const pagination = document.querySelector("#listingPagination");
    if (!pagination) return;

    if (totalPages <= 1) {
      pagination.hidden = true;
      pagination.innerHTML = "";
      return;
    }

    const maxVisiblePages = 10;
    const pageGroupStart = Math.floor((currentListingPage - 1) / maxVisiblePages) * maxVisiblePages + 1;
    const pageGroupEnd = Math.min(totalPages, pageGroupStart + maxVisiblePages - 1);
    const pageButtons = Array.from({ length: pageGroupEnd - pageGroupStart + 1 }, (_item, index) => {
      const page = pageGroupStart + index;
      return `<button class="${page === currentListingPage ? "is-active" : ""}" type="button" data-page="${page}" aria-current="${page === currentListingPage ? "page" : "false"}">${page}</button>`;
    }).join("");

    const firstItem = ((currentListingPage - 1) * listingsPerPage) + 1;
    const lastItem = Math.min(currentListingPage * listingsPerPage, totalItems);
    pagination.innerHTML = `
      <span>แสดง ${firstItem}-${lastItem} จาก ${totalItems.toLocaleString("th-TH")} ประกาศ</span>
      <div>
        <button type="button" data-page-prev ${currentListingPage === 1 ? "disabled" : ""}>ก่อนหน้า</button>
        ${pageButtons}
        <button type="button" data-page-next ${currentListingPage === totalPages ? "disabled" : ""}>ถัดไป</button>
      </div>
    `;
    pagination.hidden = false;
  }

  function renderSoldListings(listings) {
    const section = document.querySelector("#soldListings");
    const scroller = document.querySelector("#soldListingScroller");
    const count = document.querySelector("#soldListingCount");
    if (!section || !scroller || !count) return;
    const visibleListings = listings.filter((listing) => accountListingEnabled || listing.category !== "account");

    if (!visibleListings.length) {
      section.hidden = true;
      scroller.innerHTML = "";
      count.textContent = "0 รายการ";
      return;
    }

    const cards = visibleListings.map((listing) => {
      const title = listing.title || listing.item_name || "ประกาศขาย";
      const price = listing.price_text ? `฿ ${formatListingPrice(listing.price_text)}` : "";
      const sellerName = listing.seller_name || "ผู้ขาย ROOC";
      const listingImages = getListingImages(listing);
      const displayImage = listingImages[0];

      return `
        <article class="sold-card">
          <img src="${escapeHtml(displayImage)}" alt="" loading="lazy" decoding="async" />
          <div>
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(price)} · ${escapeHtml(sellerName)}</p>
            <strong>ขายแล้ว</strong>
          </div>
        </article>
      `;
    }).join("");

    count.textContent = `${visibleListings.length.toLocaleString("th-TH")} รายการ`;
    
    // ปรับ Logic การเลื่อน: ถ้ามีรายการน้อยกว่า 4 ไม่ต้องเลื่อน (Static)
    // และถ้าจะเลื่อน (มากกว่า 3) ให้เบิ้ลรายการเพื่อให้ Loop เนียนขึ้น
    const shouldScroll = visibleListings.length > 3;
    scroller.classList.toggle("is-static", !shouldScroll);
    
    // คำนวณเวลา (Duration) ตามจำนวนรายการ เพื่อให้ความเร็วในการเลื่อนคงที่
    // ให้เฉลี่ยรายการละ 3 วินาที (ขั้นต่ำ 20 วินาที)
    const scrollDuration = Math.max(20, visibleListings.length * 3);
    
    scroller.innerHTML = `
      <div class="sold-track" style="animation-duration: ${scrollDuration}s">
        ${cards}${shouldScroll ? cards : ""}
      </div>
    `;
    section.hidden = false;
  }

  function renderSupportSidebar(settings) {
    const sidebar = document.querySelector("#supportSidebar");
    if (!sidebar) return;

    const defaultDonateGoalUrl = "https://widgets.easydonate.app?w=goal&u=kacamuzqsbaegbgdq3w2ct3j&t=3538844b626beec00859d48a9a1433a7&ts=1781015612021";
    const donateGoalUrl = String(settings.donate_goal_url || defaultDonateGoalUrl).trim();
    const donateGoalCurrent = Math.max(0, parsePrice(settings.donate_goal_current));
    const donateGoalTarget = Math.max(1, parsePrice(settings.donate_goal_target) || 10000);
    const donateGoalPercent = Math.min(100, Math.round((donateGoalCurrent / donateGoalTarget) * 100));
    const cards = [
      {
        type: "card",
        enabled: settings.donate_enabled,
        eyebrow: "Donate",
        title: settings.donate_title || "สนับสนุน ROOC Market TH",
        text: settings.donate_text || "",
        qr: settings.donate_qr_url || "",
        button: settings.donate_button_label || "โดเนท",
        url: settings.donate_button_url || ""
      },
      {
        type: "card",
        enabled: settings.middleman_enabled,
        eyebrow: "Middleman",
        title: settings.middleman_title || "ติดต่อ Middleman",
        text: settings.middleman_text || "",
        qr: settings.middleman_qr_url || "",
        button: settings.middleman_button_label || "ติดต่อ Middleman",
        url: settings.middleman_button_url || ""
      },
      {
        type: "goal",
        enabled: settings.donate_goal_enabled !== false,
        title: settings.donate_goal_title || "Donate Goal",
        text: settings.donate_goal_text || "",
        button: settings.donate_goal_button_label || "โดเนท",
        url: donateGoalUrl,
        current: donateGoalCurrent,
        target: donateGoalTarget,
        percent: donateGoalPercent
      }
    ].filter((card) => card.enabled);

    if (!cards.length) {
      sidebar.hidden = true;
      sidebar.innerHTML = "";
      return;
    }

    sidebar.innerHTML = cards.map((card) => {
      if (card.type === "goal") {
        return `
          <article class="donate-goal-card">
            <p class="eyebrow">Donate Goal</p>
            <h3>${escapeHtml(card.title)}</h3>
            ${card.text ? `<p>${escapeHtml(card.text)}</p>` : ""}
            <div class="donate-goal-meter" role="progressbar" aria-valuemin="0" aria-valuemax="${escapeHtml(card.target)}" aria-valuenow="${escapeHtml(card.current)}">
              <span style="width: ${escapeHtml(card.percent)}%"></span>
            </div>
            <div class="donate-goal-stats">
              <strong>฿ ${card.current.toLocaleString("th-TH")}</strong>
              <span>${escapeHtml(card.percent)}%</span>
              <small>เป้าหมาย ฿ ${card.target.toLocaleString("th-TH")}</small>
            </div>
            ${card.url ? `<a class="btn btn-primary support-button" href="${escapeHtml(card.url)}" target="_blank" rel="noopener">${escapeHtml(card.button)}</a>` : ""}
          </article>
        `;
      }

      return `
        <article class="support-card">
          <p class="eyebrow">${escapeHtml(card.eyebrow)}</p>
          <h3>${escapeHtml(card.title)}</h3>
          ${card.text ? `<p>${escapeHtml(card.text)}</p>` : ""}
          ${card.qr ? `<img class="support-qr" src="${escapeHtml(card.qr)}" alt="QR Code ${escapeHtml(card.title)}" loading="lazy" decoding="async" />` : ""}
          ${card.url ? `<a class="btn btn-primary support-button" href="${escapeHtml(card.url)}" target="_blank" rel="noopener">${escapeHtml(card.button)}</a>` : ""}
        </article>
      `;
    }).join("");
    sidebar.hidden = false;
  }

  let sponsorInterval = null;

  function renderHeroSponsor(settings) {
    const sponsor = document.querySelector("#heroSponsor");
    if (!sponsor) return;

    // Clear existing interval if any
    if (sponsorInterval) {
      clearInterval(sponsorInterval);
      sponsorInterval = null;
    }

    // Support up to 4 images (hero_sponsor_image_url, hero_sponsor_image_url_2, etc.)
    const ads = [
      { url: settings.hero_sponsor_image_url, link: settings.hero_sponsor_button_url },
      { url: settings.hero_sponsor_image_url_2, link: settings.hero_sponsor_button_url_2 },
      { url: settings.hero_sponsor_image_url_3, link: settings.hero_sponsor_button_url_3 },
      { url: settings.hero_sponsor_image_url_4, link: settings.hero_sponsor_button_url_4 }
    ].filter(ad => ad.url && String(ad.url).trim() !== "");

    const title = String(settings.hero_sponsor_title || "").trim();
    const text = String(settings.hero_sponsor_text || "").trim();
    const buttonLabel = String(settings.hero_sponsor_button_label || "ดูรายละเอียด").trim();

    if (!settings.hero_sponsor_enabled || (ads.length === 0 && !title && !text)) {
      sponsor.classList.remove("has-sponsor");
      sponsor.innerHTML = "";
      sponsor.setAttribute("aria-hidden", "true");
      return;
    }

    sponsor.classList.add("has-sponsor");
    sponsor.removeAttribute("aria-hidden");

    const slidesHtml = ads.map((ad, index) => `
      <div class="sponsor-slide ${index === 0 ? 'is-active' : ''}">
        <img src="${escapeHtml(ad.url)}" alt="" loading="lazy" decoding="async" />
      </div>
    `).join('');

    sponsor.innerHTML = `
      <a id="heroSponsorLink" href="${escapeHtml(ads[0].link || "#")}" target="_blank" rel="noopener" class="hero-sponsor-wrapper" ${!ads[0].link ? 'style="pointer-events:none"' : ""}>
        <article class="hero-sponsor-card">
          ${slidesHtml}
          <div class="hero-sponsor-content">
            ${title ? `<h2>${escapeHtml(title)}</h2>` : ""}
            ${text ? `<span>${escapeHtml(text)}</span>` : ""}
          </div>
        </article>
      </a>
    `;

    // Setup Auto Slide if more than 1 image
    if (ads.length > 1) {
      let currentSlide = 0;
      const slides = sponsor.querySelectorAll(".sponsor-slide");
      const sponsorLink = sponsor.querySelector("#heroSponsorLink");
      
      sponsorInterval = setInterval(() => {
        slides[currentSlide].classList.remove("is-active");
        currentSlide = (currentSlide + 1) % slides.length;
        slides[currentSlide].classList.add("is-active");
        
        // Update link for current slide
        if (sponsorLink) {
          const currentAd = ads[currentSlide];
          if (currentAd.link && String(currentAd.link).trim() !== "") {
            sponsorLink.href = currentAd.link;
            sponsorLink.style.pointerEvents = "auto";
          } else {
            sponsorLink.href = "#";
            sponsorLink.style.pointerEvents = "none";
          }
        }
      }, 3000); // 3 seconds per slide
    }
  }

  function renderHeroAnnouncement(settings) {
    const announcement = document.querySelector("#heroAnnouncement");
    if (!announcement) return;

    const text = String(settings.announcement_text || "").trim();
    if (!settings.announcement_enabled || !text) {
      announcement.hidden = true;
      announcement.innerHTML = "";
      return;
    }

    const escapedText = escapeHtml(text);
    announcement.innerHTML = `
      <div class="announcement-marquee" role="status" aria-live="polite">
        <span>${escapedText}</span>
        <span aria-hidden="true">${escapedText}</span>
      </div>
    `;
    announcement.hidden = false;
  }

  function applySiteSettings(settings = {}) {
    accountListingEnabled = settings.account_listing_enabled !== false;

    const accountCount = document.querySelector("#accountListingCount");
    const accountCard = accountCount?.closest("article");
    if (accountCard) accountCard.hidden = !accountListingEnabled;

    const controls = getFilterControls();
    if (!accountListingEnabled && controls.category?.value === "account") {
      controls.category.value = "all";
    }
    syncCategoryUi(controls.category?.value || "all");
  }

  function renderFilteredListings() {
    if (!document.querySelector("#latestListingGrid")) return;
    renderCounts(publicListings);
    renderListingCards(getFilteredListings(), true);
  }

  function resetListingPage() {
    currentListingPage = 1;
  }

  async function refreshListings(force = false) {
    const controls = getFilterControls();
    if (controls.refresh) {
      controls.refresh.disabled = true;
      controls.refresh.classList.add("is-loading");
      controls.refresh.setAttribute("aria-label", "กำลังรีเฟรชสินค้า");
    }

    try {
      renderListingSkeletons();
      [publicListings, soldListings] = await Promise.all([
        fetchPublicListings(Boolean(force)),
        fetchSoldListings(Boolean(force)).catch((error) => {
          console.warn("ROOC sold listings failed:", error);
          return [];
        })
      ]);
      renderFilteredListings();
      renderSoldListings(soldListings);
      console.info(`ROOC listings refreshed ${publicListings.length} active rows, ${soldListings.length} sold rows`);
    } catch (error) {
      console.error("ROOC listings refresh failed:", error);
    } finally {
      if (controls.refresh) {
        controls.refresh.classList.remove("is-loading");
        if (force) {
          setRefreshCooldown(10);
        } else {
          controls.refresh.disabled = false;
          controls.refresh.setAttribute("aria-label", "รีเฟรชสินค้า");
          controls.refresh.title = "รีเฟรชสินค้า";
        }
      }
    }
  }

  function bindFilters() {
    if (document.body.dataset.filtersBound === "true") return;
    document.body.dataset.filtersBound = "true";
    const controls = getFilterControls();
    const rerender = () => {
      resetListingPage();
      renderFilteredListings();
    };

    controls.search?.addEventListener("input", rerender);
    controls.search?.addEventListener("search", rerender);
    controls.search?.addEventListener("change", rerender);
    controls.sort?.addEventListener("change", rerender);
    controls.refresh?.addEventListener("click", () => {
      if (refreshCooldownEndsAt > Date.now()) return;
      refreshListings(true);
    });
    controls.price?.addEventListener("change", rerender);
    controls.middleman?.addEventListener("change", rerender);
    controls.ready?.addEventListener("change", rerender);

    controls.typeTabs.forEach((button) => {
      button.addEventListener("click", () => {
        syncListingTypeUi(button.dataset.listingType || "sell");
        rerender();
      });
    });

    controls.heroServer?.addEventListener("change", (event) => {
      syncServerUi(event.target.value, event.target);
      rerender();
    });

    controls.sidebarServer?.addEventListener("change", (event) => {
      syncServerUi(event.target.value, event.target);
      rerender();
    });

    controls.category?.addEventListener("change", (event) => {
      if (activeListingType === "buy" && event.target.value === "account") {
        event.target.value = "all";
      }
      syncCategoryUi(event.target.value);
      rerender();
    });

    controls.tabs.forEach((button) => {
      button.addEventListener("click", () => {
        syncCategoryUi(button.dataset.category || "all");
        rerender();
      });
    });

    controls.reset?.addEventListener("click", () => {
      if (controls.search) controls.search.value = "";
      syncListingTypeUi("sell");
      syncServerUi("ทั้งหมด");
      syncCategoryUi("all");
      if (controls.price) controls.price.value = "all";
      if (controls.sort) controls.sort.value = "newest";
      if (controls.middleman) controls.middleman.checked = false;
      if (controls.ready) controls.ready.checked = false;
      rerender();
    });

    document.querySelector("#listingPagination")?.addEventListener("click", (event) => {
      const pageButton = event.target.closest("[data-page]");
      const prevButton = event.target.closest("[data-page-prev]");
      const nextButton = event.target.closest("[data-page-next]");
      if (pageButton) currentListingPage = Number(pageButton.dataset.page) || 1;
      if (prevButton) currentListingPage = Math.max(1, currentListingPage - 1);
      if (nextButton) currentListingPage += 1;
      if (pageButton || prevButton || nextButton) {
        renderFilteredListings();
        document.querySelector("#market")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });

    const searchForm = controls.search?.closest("form");
    searchForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      rerender();
      document.querySelector("#market")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function hydratePublicListings() {
    if (!document.querySelector("#latestListingGrid")) return;
    try {
      bindFilters();
      fetchActiveServers()
        .then(populateServerSelects)
        .catch((error) => {
          console.warn("ROOC servers failed:", error);
          populateServerSelects(fallbackServers);
        });
      const settings = await fetchSiteSettings().catch((error) => {
        console.warn("ROOC support settings failed:", error);
        return {};
      });
      applySiteSettings(settings);
      renderSupportSidebar(settings);
      renderHeroSponsor(settings);
      renderHeroAnnouncement(settings);
      await refreshListings();
      console.info(`ROOC public listings loaded ${publicListings.length} active rows, ${soldListings.length} sold rows`);
    } catch (error) {
      console.error("ROOC public listings failed:", error);
    }
  }

  function getDiscordDisplayName(session) {
    const user = session?.user || {};
    const identityData = user.identities?.find((identity) => identity.provider === "discord")?.identity_data || {};
    return user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.user_metadata?.preferred_username ||
      identityData.full_name ||
      identityData.name ||
      identityData.preferred_username ||
      user.email ||
      "Discord";
  }

  function getDiscordAvatarUrl(session) {
    const user = session?.user || {};
    const identityData = user.identities?.find((identity) => identity.provider === "discord")?.identity_data || {};
    return user.user_metadata?.avatar_url ||
      user.user_metadata?.picture ||
      identityData.avatar_url ||
      identityData.picture ||
      "";
  }

  function getDiscordId(session) {
    const identity = session?.user?.identities?.find((entry) => entry.provider === "discord");
    return identity?.identity_data?.sub || identity?.id || "";
  }

  function getSessionEmail(session) {
    const user = session?.user || {};
    return (user.email || user.user_metadata?.email || user.identities?.[0]?.identity_data?.email || "").toLowerCase();
  }

  async function upsertMarketplaceProfile(session) {
    if (!session || !supabaseClient) return;
    await supabaseClient
      .from("marketplace_profiles")
      .upsert({
        user_id: session.user.id,
        discord_id: getDiscordId(session),
        display_name: getDiscordDisplayName(session),
        avatar_url: getDiscordAvatarUrl(session),
        email: getSessionEmail(session)
      }, { onConflict: "user_id" });
  }

  async function getPremiumStatus(session) {
    if (!session || !supabaseClient) return false;
    const discordId = getDiscordId(session);
    const { data, error } = await supabaseClient
      .from("marketplace_premium_users")
      .select("*")
      .or(`user_id.eq.${session.user.id}${discordId ? `,discord_id.eq.${discordId}` : ""}`)
      .maybeSingle();
    if (error) return false;
    return data && (data.active === true || data.active === "true" || data.active === 1 || data.active === "1");
  }

  function isAdminSession(session) {
    if (!session) return false;
    const user = session.user || {};
    const email = getSessionEmail(session);
    const identities = user.identities || [];
    const discordIds = identities
      .filter((identity) => identity.provider === "discord")
      .map((identity) => identity.identity_data?.sub || identity.id)
      .filter(Boolean);
    return (config.adminUserIds || []).includes(user.id) ||
      (config.adminEmails || []).map((entry) => entry.toLowerCase()).includes(email) ||
      discordIds.some((id) => (config.adminDiscordIds || []).includes(id));
  }

  window.ROOC_APP = {
    config,
    canUseSupabase,
    supabaseClient,
    getSupabaseClient,
    initTheme,
    escapeHtml,
    getDiscordDisplayName,
    getDiscordAvatarUrl,
    getDiscordId,
    getSessionEmail,
    isAdminSession,
    getListingImages,
    getListingProfileUrl,
    getListingDiscordId,
    getDiscordIdFromContact,
    getContactProfileUrl,
    parsePrice,
    formatListingPrice,
    getDescriptionParts,
    getPremiumStatus,
	      initStorePage: async (sellerId) => {
	      console.log("initStorePage starting for seller:", sellerId);
	      const grid = document.querySelector("#storeListingGrid");
	      const emptyState = document.querySelector("#storeEmptyState");
	      const storeName = document.querySelector("#storeName");
      const storeAvatar = document.querySelector("#storeAvatar");
      const storeFacebook = document.querySelector("#storeFacebook");
      const storeDiscordText = document.querySelector("#storeDiscordText");
      const storeTotalListings = document.querySelector("#storeTotalListings");
      const storeSoldItems = document.querySelector("#storeSoldItems");
      
      // ดึงข้อมูลจาก URL เบื้องต้นเพื่อป้องกันหน้า "เกิดข้อผิดพลาด"
      const urlParams = new URLSearchParams(window.location.search);
      const urlName = urlParams.get("name");
      const urlAvatar = urlParams.get("avatar");
      
      if (urlName) storeName.textContent = urlName;
      if (urlAvatar) storeAvatar.src = urlAvatar;

	      let storeListings = [];
	      let currentCategory = "all";
	      let currentSort = "newest";
	      let offerMailbox = new Map();
	      
	      const { data: authData } = await supabaseClient.auth.getSession();
	      const currentSession = authData.session;
	      const isOwner = currentSession && currentSession.user.id === sellerId;

      // Expose state ออกมาเป็น global เพื่อให้ showThemePickerModal ใน store.html เข้าถึงได้
      window._storeState = window._storeState || {};
      window._storeState.storeListings = storeListings;
      window._storeState.currentSession = currentSession;
      window._storeState.isOwner = isOwner;
      
      // กำหนด listingSelectColumns ที่ใช้ในฟังก์ชัน
      const storeListingSelectColumns = [
        "id",
        "user_id",
        "listing_type",
        "category",
        "item_name",
        "title",
        "image_url",
        "image_urls",
        "character_name",
        "seller_name",
        "seller_avatar_url",
        "seller_discord_id",
        "seller_is_premium",
        "price_text",
        "server_name",
        "contact",
        "description",
        "middleman",
        "offers_enabled",
        "ready_today",
        "facebook_url",
        "active",
        "sale_status",
        "card_background",
        "created_at"
      ].join(",");
      
      const storeLegacyListingSelectColumns = storeListingSelectColumns
        .split(",")
        .filter((column) => column !== "listing_type" && column !== "facebook_url")
        .join(",");

      const renderStoreGrid = () => {
        // ให้แสดงรายการที่ active หรือขายแล้ว (sold)
        let filtered = storeListings.filter(l => {
          const categoryMatch = currentCategory === "all" || l.category === currentCategory;
          const statusMatch = l.active || l.sale_status === "sold";
          return categoryMatch && statusMatch;
        });
        
        if (currentSort === "price-low") filtered.sort((a, b) => parsePrice(a.price_text) - parsePrice(b.price_text));
        else if (currentSort === "price-high") filtered.sort((a, b) => parsePrice(b.price_text) - parsePrice(a.price_text));
        else filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        grid.innerHTML = filtered.map(listing => {
          const title = listing.title || listing.item_name || "ประกาศขาย";
          const listingType = listing.listing_type || "sell";
          const isServiceListing = listingType === "service";
          const listingImages = getListingImages(listing);
          const contact = listing.contact || "";
          const profileUrl = getListingProfileUrl(listing);
          const discordId = getListingDiscordId(listing);
          const sellerName = listing.seller_name || "ผู้ขาย ROOC";
          const sellerAvatar = listing.seller_avatar_url || "assets/category-icons/account-b.png";
	          const badges = [
	            `<span class="${listingType === "buy" ? "buy" : listingType === "service" ? "verified" : "fast"} shine">${listingType === "buy" ? "รับซื้อ" : listingType === "service" ? "รับจ้าง" : "ขาย"}</span>`,
	            `<span class="shine">${escapeHtml(listing.server_name || "ทั้งหมด")}</span>`,
	            listing.ready_today ? '<span class="fast pulse">FAST DEAL</span>' : "",
	            listing.category === "mvp" ? '<span class="mvp shine">MVP</span>' : ""
	          ].filter(Boolean).join("");
          const description = listing.description || "";
          const descriptionParts = getDescriptionParts(description);

		          const isSold = listing.sale_status === "sold";
		          const status = isSold ? { label: "ขายแล้ว", className: "mvp" } : (listing.active && (listing.sale_status === "active") ? { label: "กำลังแสดง", className: "active" } : { label: "ปิดอยู่", className: "closed" });
		          const offers = offerMailbox.get(listing.id) || [];
		          
		          return `
		            <article class="listing-card${isServiceListing ? " service-listing-card" : ""}${listing.card_background && listing.card_background !== 'default' ? " " + listing.card_background : ""}${(!listing.active && !isSold) ? " is-closed" : ""}${isSold ? " is-sold" : ""}">
		              ${isServiceListing ? "" : `<div class="item-media">
		                <img src="${escapeHtml(listingImages[0])}" alt="" loading="lazy" />
		                ${isSold ? '<div class="sold-overlay">SOLD</div>' : ""}
		              </div>`}
		              <div class="listing-seller" style="display: flex; align-items: center; gap: 8px; min-width: 0;">
		                <img src="${escapeHtml(sellerAvatar)}" alt="" style="flex-shrink: 0;" />
		                <span style="display: flex; align-items: center; gap: 4px; min-width: 0; overflow: hidden;">
		                  <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(sellerName)}</span>
		                  ${listing.seller_is_premium ? '<strong title="Premium" style="color: #f59e0b; font-size: 14px; text-shadow: 0 0 8px rgba(245, 158, 11, 0.3); flex-shrink: 0;">♛</strong>' : ""}
		                </span>
		                ${isOwner ? `<span class="status-badge ${status.className}" style="margin-left: auto; flex-shrink: 0;">${status.label}</span>` : ""}
		              </div>
	              <div class="listing-meta">${badges}</div>
	              <h3>${escapeHtml(title)}</h3>
	              <p class="listing-description">${escapeHtml(descriptionParts.shortText)}</p>
	              
	              <div class="price-row">
	                <strong>฿ ${formatListingPrice(listing.price_text)}</strong>
	                <span class="listing-card-actions">
	                  ${isOwner ? `
	                    <button class="btn btn-small btn-light" data-edit-price="${listing.id}">✏️ แก้ราคา</button>
	                    <button class="btn btn-small btn-light" data-toggle="${listing.id}">${listing.active ? "⏸️ ปิด" : "▶️ เปิด"}</button>
	                  ` : `
		                    ${listing.offers_enabled && !isSold ? `<button class="btn btn-small btn-light offer-button" type="button" data-offer-listing-id="${escapeHtml(listing.id)}" data-offer-title="${escapeHtml(title)}" data-offer-price="${escapeHtml(listing.price_text)}">เสนอราคา</button>` : ""}
		                    <button class="btn btn-small contact-seller-button" type="button" data-title="${escapeHtml(title)}" data-contact="${escapeHtml(contact)}" data-profile-url="${escapeHtml(profileUrl)}" data-discord-id="${escapeHtml(discordId)}" data-seller-name="${escapeHtml(sellerName)}">${listingType === "buy" ? "ติดต่อผู้รับซื้อ" : listingType === "service" ? "ติดต่อผู้รับจ้าง" : "ติดต่อผู้ขาย"}</button>
		                  `}
	                </span>
	              </div>

	              ${isOwner ? `
		                <div class="owner-controls">
		                  <button class="btn btn-small btn-light" onclick="event.stopPropagation(); window.toggleOffers?.('${listing.id}')">${listing.offers_enabled ? "🔕 ปิดเสนอราคา" : "🔔 เปิดเสนอราคา"}</button>
		                  <button class="btn btn-small btn-light" onclick="event.stopPropagation(); window.showThemePickerModal?.('${listing.id}')">✨ พื้นหลัง</button>
		                  <button class="btn btn-small btn-light" onclick="event.stopPropagation(); window.markListingSold?.('${listing.id}')">✅ ขายแล้ว</button>
		                  <button class="btn btn-small btn-light" onclick="event.stopPropagation(); window.deleteListing?.('${listing.id}')" style="color: var(--expired);">🗑️ ลบ</button>
		                </div>
	                ${offers.length > 0 ? `
	                  <div class="offer-mailbox">
	                    <strong>Mailbox (${offers.length})</strong>
	                    ${offers.slice(0, 2).map(o => `<div class="offer-mail"><b>฿${formatListingPrice(o.offer_price_text)}</b> - ${escapeHtml(o.buyer_display_name)}</div>`).join("")}
	                  </div>
	                ` : ""}
	              ` : ""}
	            </article>
	          `;
        }).join("");
        
        emptyState.hidden = filtered.length > 0;
      };

      try {
        console.log("Fetching store for user_id:", sellerId);
        
        if (!supabaseClient) {
          storeName.textContent = "ไม่สามารถเชื่อมต่อ Supabase";
          emptyState.hidden = false;
          return;
        }
        
	        // ฟังก์ชันช่วยดึงข้อมูลแบบปลอดภัย
	        const safeFetch = async (columns, idValue, idColumn = "user_id") => {
	          try {
	            const query = supabaseClient
	              .from("marketplace_listings")
	              .select(columns)
	              .eq(idColumn, idValue)
	              .neq("sale_status", "deleted")
	              .order("created_at", { ascending: false });
	            
		            // ถ้าไม่ใช่เจ้าของร้าน ให้ดูได้เฉพาะที่ active หรือขายแล้ว (ไม่เอาที่ closed/deleted)
		            if (!isOwner) {
		              query.or('active.eq.true,sale_status.eq.sold').neq("sale_status", "closed");
		            }
	            
	            const { data, error } = await query;
	            return { data, error };
	          } catch (e) {
	            return { data: null, error: e };
	          }
	        };

        // ลองดึงด้วย user_id ก่อน
        let result = await safeFetch(storeListingSelectColumns.includes("user_id") ? storeListingSelectColumns : storeListingSelectColumns + ",user_id", sellerId);
        
        // ถ้าหาไม่เจอ หรือพัง ให้ลองดึงด้วย seller_name (Fallback สำหรับประกาศเก่า)
        if (result.error || !result.data || result.data.length === 0) {
          console.warn("Fetch by user_id failed or empty, trying seller_name fallback...");
          const fallbackName = urlName || "ผู้ขาย ROOC";
          result = await safeFetch(storeLegacyListingSelectColumns, fallbackName, "seller_name");
        }
        
        if (result.error) {
          console.warn("Secondary fetch failed, trying minimum columns with seller_name...");
          const fallbackName = urlName || "ผู้ขาย ROOC";
          result = await safeFetch("id,title,item_name,price_text,listing_type,seller_name,seller_avatar_url,created_at,active,sale_status,category,server_name", fallbackName, "seller_name");
        }

        if (result.error) throw result.error;
        const data = result.data;
        storeListings = data || [];
        // อัปเดต global state หลังจาก fetch เสร็จ
        if (window._storeState) window._storeState.storeListings = storeListings;
        console.log("Store listings found:", storeListings.length);
        
	        // ดึงข้อมูลโปรไฟล์โดยตรง (เผื่อกรณีไม่มีประกาศสินค้าเลย)
	        const { data: profile } = await supabaseClient.from("marketplace_profiles").select("*").eq("user_id", sellerId).maybeSingle();
	        
		        if (profile || storeListings.length > 0) {
		          const seller = profile || storeListings[0];
		          storeName.textContent = seller.display_name || seller.seller_name || "ผู้ขาย ROOC";
		          if (seller.avatar_url || seller.seller_avatar_url) storeAvatar.src = seller.avatar_url || seller.seller_avatar_url;
		          
		          // Reset Social Icons
		          storeFacebook.hidden = true;
		          const storeInstagram = document.querySelector("#storeInstagram");
		          if (storeInstagram) storeInstagram.hidden = true;

		          // ดึงข้อมูลจาก profile หรือ seller (จาก listings)
		          const finalFacebook = profile?.facebook_url || seller.facebook_url || seller.seller_facebook_url;
		          const finalInstagram = profile?.instagram_url || seller.instagram_url || seller.seller_instagram_url;

		          console.log("Social Links Debug:", { finalFacebook, finalInstagram });

		          if (finalFacebook && finalFacebook.trim() !== "") {
		            storeFacebook.href = finalFacebook.startsWith('http') ? finalFacebook : `https://${finalFacebook}`;
		            storeFacebook.removeAttribute('hidden');
		            storeFacebook.style.display = 'flex';
		          }
		          if (finalInstagram && finalInstagram.trim() !== "" && storeInstagram) {
		            storeInstagram.href = finalInstagram.startsWith('http') ? finalInstagram : `https://${finalInstagram}`;
		            storeInstagram.removeAttribute('hidden');
		            storeInstagram.style.display = 'flex';
		          }
			          if (storeDiscordText) storeDiscordText.textContent = seller.discord_id || seller.seller_discord_id || seller.contact || "N/A";
	          
		          storeTotalListings.textContent = storeListings.filter(l => l.active && l.sale_status !== 'sold').length;
		          storeSoldItems.textContent = storeListings.filter(l => l.sale_status === "sold").length;
	          
	          if (isOwner) {
	            // ดึงโควตาและ Mailbox สำหรับเจ้าของร้าน
	            const { data: profile } = await supabaseClient.from("marketplace_profiles").select("listing_limit").eq("user_id", sellerId).maybeSingle();
		            const isPremium = await getPremiumStatus(currentSession);
			            const limit = profile?.listing_limit || (isPremium ? 5 : 2);
		            
		            const sellListings = storeListings.filter(l => (l.listing_type || "sell") === "sell" && l.sale_status !== "deleted");
		            const buyListings = storeListings.filter(l => l.listing_type === "buy" && l.sale_status !== "deleted");
		            const serviceListings = storeListings.filter(l => l.listing_type === "service" && l.sale_status !== "deleted");
	
		            const quotaUsed = document.querySelector("#quotaUsed");
		            const quotaRemaining = document.querySelector("#quotaRemaining");
		            const quotaService = document.querySelector("#quotaService");
		            const quotaPlan = document.querySelector("#quotaPlan");
	
		            if (quotaUsed) quotaUsed.textContent = `${sellListings.filter(l => l.active).length}/${limit}`;
		            if (quotaRemaining) quotaRemaining.textContent = `${buyListings.filter(l => l.active).length}/${limit}`;
		            if (quotaService) quotaService.textContent = `${serviceListings.filter(l => l.active).length}/${limit}`;
		            if (quotaPlan) {
		              quotaPlan.textContent = isPremium ? "Premium" : "Free";
		              quotaPlan.className = isPremium ? "quota-value is-premium" : "quota-value";
		            }

	            // ดึง Mailbox
	            const { data: offers } = await supabaseClient.from("marketplace_listing_offers").select("*").in("listing_id", storeListings.map(l => l.id)).order("created_at", { ascending: false });
	            if (offers) {
	              offers.forEach(o => {
	                if (!offerMailbox.has(o.listing_id)) offerMailbox.set(o.listing_id, []);
	                offerMailbox.get(o.listing_id).push(o);
	              });
	            }
	          }

	          renderStoreGrid();
	        } else {
          storeName.textContent = "ไม่พบผู้ขาย";
          emptyState.hidden = false;
        }
	      } catch (err) {
	        console.error("Store error:", err);
	        if (storeName) storeName.textContent = "เกิดข้อผิดพลาด: " + (err.message || "Unknown error");
	      }

      document.querySelectorAll("#storeCategoryTabs button").forEach(btn => {
        btn.addEventListener("click", () => {
          document.querySelectorAll("#storeCategoryTabs button").forEach(b => b.classList.remove("is-active"));
          btn.classList.add("is-active");
          currentCategory = btn.dataset.category;
          renderStoreGrid();
        });
      });

      document.querySelector("#storeSortFilter")?.addEventListener("change", (e) => {
        currentSort = e.target.value;
        renderStoreGrid();
      });

      document.querySelectorAll("[data-close-contact]").forEach(el => {
        el.addEventListener("click", () => {
          const modal = document.querySelector("#sellerContactModal");
          if (modal) modal.hidden = true;
        });
      });
    }
  };

  function ensureAccountLink() {
    const navLinks = document.querySelector(".nav-links");
    if (!navLinks || navLinks.querySelector(".my-listings-link")) return null;
    const link = document.createElement("a");
    link.className = "my-listings-link";
    link.href = "store.html";
    link.textContent = "ร้านค้าของฉัน";
    link.hidden = true;
    navLinks.append(link);
    return link;
  }

  async function fetchReceivedOffers(session, limit = 20) {
    if (!session || !supabaseClient) return [];

    const { data: listings, error: listingsError } = await supabaseClient
      .from("marketplace_listings")
      .select("id,title,item_name,price_text")
      .eq("user_id", session.user.id)
      .neq("sale_status", "deleted")
      .limit(120);

    if (listingsError || !listings?.length) return [];

    const listingMap = new Map(listings.map((listing) => [listing.id, listing]));
    const { data: offers, error: offersError } = await supabaseClient
      .from("marketplace_listing_offers")
      .select("id,listing_id,buyer_display_name,offer_price_text,message,status,created_at")
      .in("listing_id", listings.map((listing) => listing.id))
      .neq("status", "deleted")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (offersError) {
      if (!/marketplace_listing_offers|relation|schema cache/i.test(offersError.message || "")) {
        console.warn("ROOC mailbox offers failed:", offersError);
      }
      return [];
    }

    return (offers || []).map((offer) => ({
      ...offer,
      listing: listingMap.get(offer.listing_id) || null
    }));
  }

  function renderMailboxItems(offers) {
    if (!offers.length) {
      return '<p class="mailbox-empty">ยังไม่มีราคาเสนอใหม่</p>';
    }

    return offers.map((offer) => {
      const listingTitle = offer.listing?.title || offer.listing?.item_name || "ประกาศของคุณ";
      return `
        <button class="mailbox-item${offer.status === "new" ? " is-new" : ""}" type="button" data-offer-read="${escapeHtml(offer.id)}">
          <span>
            <strong>฿ ${formatListingPrice(offer.offer_price_text)}</strong>
            <small>${escapeHtml(offer.buyer_display_name || "ผู้เสนอราคา")} เสนอใน ${escapeHtml(listingTitle)}</small>
          </span>
          ${offer.message ? `<em>${escapeHtml(offer.message)}</em>` : ""}
        </button>
      `;
    }).join("");
  }

  async function createMailboxMenu(session) {
    const offers = await fetchReceivedOffers(session);
    const unreadCount = offers.filter((offer) => offer.status === "new").length;
    const mailbox = document.createElement("div");
    mailbox.className = "mailbox-menu";
    mailbox.innerHTML = `
      <button class="mailbox-trigger" type="button" aria-label="Mailbox เสนอราคา" aria-expanded="false">
        <span aria-hidden="true">✉</span>
        ${unreadCount ? `<b>${unreadCount > 99 ? "99+" : unreadCount}</b>` : ""}
      </button>
      <div class="mailbox-panel" hidden>
        <div class="mailbox-head">
          <strong>Mailbox เสนอราคา</strong>
          <a href="store.html">ดูทั้งหมด</a>
        </div>
        <div class="mailbox-list">${renderMailboxItems(offers)}</div>
      </div>
    `;
    return mailbox;
  }

  async function syncAuthUi(session) {
    const authLinks = document.querySelectorAll(".auth-link");
    const myListingsLink = document.querySelector(".my-listings-link") || ensureAccountLink();
    const adminLinks = document.querySelectorAll(".admin-link");
    const displayName = session ? getDiscordDisplayName(session) : "";
    const avatarUrl = session ? getDiscordAvatarUrl(session) : "";
    const isPremium = await getPremiumStatus(session);

    for (const link of authLinks) {
      if (!link.dataset.defaultAuthHref) {
        link.dataset.defaultAuthHref = link.getAttribute("href") || "login.html";
      }

      if (session) {
        const tools = document.createElement("div");
        tools.className = "user-tools";
        const mailbox = await createMailboxMenu(session);
        const menu = document.createElement("div");
        menu.className = "user-menu";
        menu.innerHTML = `
          <button class="user-menu-trigger" type="button" aria-expanded="false">
            <img src="${escapeHtml(avatarUrl || "assets/category-icons/account-b.png")}" alt="" />
            <span>${escapeHtml(displayName)}</span>
            ${isPremium ? '<strong title="Premium">♛</strong>' : ""}
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
          </button>
          <div class="user-menu-panel" hidden>
            <a class="premium-link" href="premium.html">Premium</a>
            <a href="store.html">ร้านค้าของฉัน</a>
            <button type="button" data-user-logout>ออกจากระบบ</button>
          </div>
        `;
        tools.append(mailbox, menu);
        link.replaceWith(tools);
      } else {
        link.textContent = "เข้าสู่ระบบ";
        link.href = link.dataset.defaultAuthHref || "login.html";
      }
    }

    if (myListingsLink) myListingsLink.hidden = !session;
    adminLinks.forEach((link) => {
      link.hidden = !isAdminSession(session);
    });
  }

  async function hydrateAuthUi() {
    if (!supabaseClient) return;
    const { data } = await supabaseClient.auth.getSession();
    await upsertMarketplaceProfile(data.session);
    await syncAuthUi(data.session);
    supabaseClient.auth.onAuthStateChange((_event, session) => {
      upsertMarketplaceProfile(session);
      syncAuthUi(session);
    });
  }

  document.addEventListener("click", async (event) => {
    const descriptionToggle = event.target.closest("[data-description-toggle]");
    const trigger = event.target.closest(".user-menu-trigger");
    const mailboxTrigger = event.target.closest(".mailbox-trigger");
    const offerRead = event.target.closest("[data-offer-read]");
    const logout = event.target.closest("[data-user-logout]");

    if (descriptionToggle) {
      event.preventDefault();
      toggleListingDescription(descriptionToggle);
      return;
    }

    document.querySelectorAll(".user-menu-panel").forEach((panel) => {
      if (!trigger || !panel.closest(".user-menu")?.contains(trigger)) panel.hidden = true;
    });
    document.querySelectorAll(".mailbox-panel").forEach((panel) => {
      if (!mailboxTrigger || !panel.closest(".mailbox-menu")?.contains(mailboxTrigger)) panel.hidden = true;
    });

    if (trigger) {
      const panel = trigger.closest(".user-menu")?.querySelector(".user-menu-panel");
      if (panel) {
        panel.hidden = !panel.hidden;
        trigger.setAttribute("aria-expanded", String(!panel.hidden));
      }
    }

    if (mailboxTrigger) {
      const panel = mailboxTrigger.closest(".mailbox-menu")?.querySelector(".mailbox-panel");
      if (panel) {
        panel.hidden = !panel.hidden;
        mailboxTrigger.setAttribute("aria-expanded", String(!panel.hidden));
      }
      return;
    }

    if (offerRead && supabaseClient) {
      const offerId = offerRead.dataset.offerRead;
      offerRead.classList.remove("is-new");
      await supabaseClient
        .from("marketplace_listing_offers")
        .update({ status: "read" })
        .eq("id", offerId)
        .eq("status", "new");
      const badge = offerRead.closest(".mailbox-menu")?.querySelector(".mailbox-trigger b");
      if (badge) {
        const nextCount = Math.max(0, Number(badge.textContent || 0) - 1);
        if (nextCount) badge.textContent = String(nextCount);
        else badge.remove();
      }
      return;
    }

    if (logout && supabaseClient) {
      await supabaseClient.auth.signOut();
      window.location.href = "index.html";
    }
  });

  // =====================================================
  // Visitor Tracking
  // =====================================================

  function getOrCreateSessionId() {
    const key = "rooc_sid";
    let sid = sessionStorage.getItem(key);
    if (!sid) {
      sid = "sid_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
      sessionStorage.setItem(key, sid);
    }
    return sid;
  }

  async function trackPageView() {
    if (!supabaseClient) return;
    try {
      const sessionId = getOrCreateSessionId();
      const page = (location.pathname + location.search).slice(0, 200);
      const referrer = (document.referrer || "").slice(0, 200);
      const userAgent = (navigator.userAgent || "").slice(0, 300);
      await supabaseClient.rpc("record_page_view", {
        p_session_id: sessionId,
        p_page: page,
        p_referrer: referrer,
        p_user_agent: userAgent
      });
    } catch (err) {
      // ไม่ block การทำงานหลักหากเกิดข้อผิดพลาด
      console.warn("ROOC visitor tracking error:", err);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initTheme();
      initFloatingElements();
      hydratePublicListings();
      hydrateAuthUi();
      trackPageView();
      // โหลดไอคอนแบบ Dynamic
      setTimeout(window.ROOC_LOAD_ICONS, 500);
    });
  } else {
    initTheme();
    initFloatingElements();
    hydratePublicListings();
    hydrateAuthUi();
    trackPageView();
    // โหลดไอคอนแบบ Dynamic
    setTimeout(window.ROOC_LOAD_ICONS, 500);
  }
})();

/**
 * Live Activity Feed Logic
 */
async function initLiveActivityFeed() {
  const feedContainer = document.getElementById('liveActivityFeed');
  const feedContent = document.getElementById('liveActivityContent');
  if (!feedContainer || !feedContent) return;

  const supabase = getSupabaseClient();
  if (!supabase) return;

  let activities = [];
  let currentIndex = 0;

  async function fetchActivities() {
    try {
      // 1. ดึงประกาศล่าสุด 5 รายการ
      const { data: listings } = await supabase
        .from('marketplace_listings')
        .select('title, seller_name, server_name, listing_type')
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(5);

      // 2. ดึงการเสนอราคาล่าสุด 5 รายการ
      const { data: offers } = await supabase
        .from('marketplace_listing_offers')
        .select('offer_price, marketplace_listings(title)')
        .order('created_at', { ascending: false })
        .limit(5);

      const newActivities = [];

      if (listings) {
        listings.forEach(l => {
          const typeText = l.listing_type === 'buy' ? 'ประกาศรับซื้อ' : l.listing_type === 'service' ? 'รับจ้างลงดัน' : 'ลงขาย';
          newActivities.push(`คุณ <strong>${l.seller_name || 'ผู้ใช้'}</strong> เพิ่ง${typeText} <span class="highlight">${l.title}</span> ใน ${l.server_name || 'ทั้งหมด'}`);
        });
      }

      if (offers) {
        offers.forEach(o => {
          if (o.marketplace_listings) {
            newActivities.push(`มีคนเสนอราคา <span class="highlight">฿${o.offer_price.toLocaleString()}</span> ให้กับ ${o.marketplace_listings.title}`);
          }
        });
      }

      // Shuffle activities
      activities = newActivities.sort(() => Math.random() - 0.5);
      
      if (activities.length > 0) {
        feedContainer.style.display = 'flex';
        showNextActivity();
      }
    } catch (err) {
      console.error('Error fetching activities:', err);
    }
  }

  function showNextActivity() {
    if (activities.length === 0) return;
    
    // 1. ค่อยๆ เลือนข้อความเก่าออก
    feedContent.classList.add('fade-out');
    
    setTimeout(() => {
      // 2. เปลี่ยนข้อความและเตรียมแอนิเมชันใหม่
      feedContent.innerHTML = activities[currentIndex];
      feedContent.classList.remove('fade-out');
      feedContent.classList.add('fade-in');
      
      // 3. เตรียมพร้อมสำหรับรอบถัดไป
      currentIndex = (currentIndex + 1) % activities.length;
      
      // ลบ class fade-in หลังจากแอนิเมชันจบเพื่อให้ทำซ้ำได้
      setTimeout(() => {
        feedContent.classList.remove('fade-in');
      }, 600);
    }, 400); // รอให้ Fade Out จบก่อน
  }

  // Fetch initially
  await fetchActivities();

  // Rotate every 5 seconds (Fast & Active)
  setInterval(showNextActivity, 5000);

  // Refresh data every 5 minutes
  setInterval(fetchActivities, 5 * 60 * 1000);
}

// เรียกใช้ initLiveActivityFeed เมื่อหน้าโหลดเสร็จ
document.addEventListener('DOMContentLoaded', () => {
  // ให้รอสักครู่เพื่อให้ระบบหลักทำงานเสร็จก่อน
  setTimeout(initLiveActivityFeed, 2000);
});
