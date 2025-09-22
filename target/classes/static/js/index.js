// =================================== JAVASCRIPT (Frontend Client) ===================================

const API = {
    products: '/api/products',
    customers: '/api/customers',
    orders: '/api/orders',
    report: '/api/orders/report',
    settings: '/api/settings',
    auth: '/api/auth',
    loyalty: '/api/loyalty',
    cart: '/api/cart',
    payment: '/api/payment'
};

let products = [];
let customers = [];
let cart = [];
let cachedOrders = [];
let currentPaymentMethod = 'cash';
let settingsCache = {};
let currentUser = null;
let sessionToken = null;
let selectedCustomer = null;
let selectedCustomerDetail = null;
let useLoyaltyCoupon = false;
let currentCartSummary = null;
let customerSearchTimer = null;
let latestCustomerSearchResults = [];
let productImageFile = null;
let salesChartInstance, bestSellerChartInstance, monthlySalesChartInstance, timeSlotChartInstance, ordersByTimeChartInstance;
let bestSellerProductIds = new Set();
let productSalesCounts = new Map();

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);
const fmtBaht = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s) => (s ?? '').toString().replace(/[&<>"'`=\/]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;", "/": "&#x2F;", "`": "&#x60;", "=": "&#x3D;" }[m]));
const CATEGORY_LABELS = {
    drinks: '🥤 เครื่องดื่ม',
    desserts: '🍰 เบเกอรี่ & ขนมหวาน',
    snacks: '🍲 อาหารทานเล่น',
    others: '📦 อื่น ๆ',
    'อื่น ๆ': '📦 อื่น ๆ'
};

const getCatName = (c) => CATEGORY_LABELS[c] || CATEGORY_LABELS.others;
const showModal = (id) => $(`#${id}`).classList.add('show');
const closeModal = (id) => {
    const modal = $(`#${id}`);
    if (modal) modal.classList.remove('show');
};

function cancelPaymentFlow(modalId) {
    clearSelectedCustomer();
    closeModal(modalId);
    if (modalId === 'paymentModal') {
        closeModal('paymentMethodModal');
    }
}

window.cancelPaymentFlow = cancelPaymentFlow;
const toast = (msg) => alert(msg);
const DEFAULT_PRODUCT_IMAGE = 'https://via.placeholder.com/160x120?text=No+Image';

document.addEventListener('DOMContentLoaded', () => {
    $('#currentDate').textContent = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: '2-digit', day: '2-digit' });

    // Check authentication first
    checkAuthentication().then(isAuthenticated => {
        if (isAuthenticated) {
            setupNavigation();
            bindActions();
            initializeApp();
        } else {
            redirectToLogin();
        }
    });
});

function setupNavigation() {
    $$('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            $$('.nav-link').forEach(l => l.classList.remove('active'));
            e.currentTarget.classList.add('active');
            $$('.content-section').forEach(s => s.classList.remove('active'));
            const sectionId = e.currentTarget.dataset.section;
            $(`#${sectionId}`).classList.add('active');
            if (sectionId === 'reports') {
                loadSalesReport();
            }
            updateSearchPlaceholder(sectionId);
            handleGlobalSearch($('#searchInput')?.value || '');
        });
    });
}

function bindActions() {
    $('#searchInput').addEventListener('input', e => handleGlobalSearch(e.target.value));
    $('#btnPay').addEventListener('click', handlePayment);
    $('#btnClear').addEventListener('click', clearCart);
    $('#confirmPayment').addEventListener('click', processPayment);
    $('#cashReceived').addEventListener('input', calculateChange);
    $('#btnAddProduct').addEventListener('click', () => openProductModal());
    $('#productForm').addEventListener('submit', saveProduct);
    $('#btnAddCustomer').addEventListener('click', () => openCustomerModal());
    $('#customerForm').addEventListener('submit', saveCustomer);
    $('#btnSaveSettings').addEventListener('click', saveSettings);
    $('#monthSelector').addEventListener('change', () => renderDailySummary(cachedOrders));
    $$('.modal').forEach(m => m.addEventListener('click', e => {
        if (e.target === m) {
            if (m.id === 'paymentModal' || m.id === 'paymentMethodModal') {
                cancelPaymentFlow(m.id);
            } else {
                closeModal(m.id);
            }
        }
    }));
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            $$('.modal.show').forEach(m => {
                if (m.id === 'paymentModal' || m.id === 'paymentMethodModal') {
                    cancelPaymentFlow(m.id);
                } else {
                    closeModal(m.id);
                }
            });
        }
    });

    const customerSearchInput = $('#customerSearch');
    if (customerSearchInput) {
        customerSearchInput.addEventListener('input', handleCustomerSearchInput);
        document.addEventListener('click', (evt) => {
            const results = $('#customerSearchResults');
            if (!results) return;
            if (!results.contains(evt.target) && evt.target !== customerSearchInput) {
                hideCustomerSearchResults();
            }
        });
    }

    const productImageInput = $('#productImageFile');
    if (productImageInput) {
        productImageInput.addEventListener('change', onProductImageChange);
    }
    const clearImageBtn = $('#btnClearProductImage');
    if (clearImageBtn) {
        clearImageBtn.addEventListener('click', clearProductImageSelection);
    }
}

function handleCustomerSearchInput(e) {
    const query = e.target.value.trim();
    clearTimeout(customerSearchTimer);

    if (query.length < 2) {
        latestCustomerSearchResults = [];
        hideCustomerSearchResults();
        return;
    }

    customerSearchTimer = setTimeout(async () => {
        try {
            const response = await fetch(`${API.loyalty}/search?query=${encodeURIComponent(query)}`, {
                cache: 'no-store'
            });
            if (!response.ok) throw new Error('Search failed');
            const results = await response.json();
            latestCustomerSearchResults = Array.isArray(results) ? results : [];
            renderCustomerSearchResults(latestCustomerSearchResults);
        } catch (error) {
            console.error('Customer search failed:', error);
            toast('ค้นหาลูกค้าไม่สำเร็จ');
        }
    }, 300);
}

function renderCustomerSearchResults(results) {
    const container = $('#customerSearchResults');
    if (!container) return;

    if (!results.length) {
        container.innerHTML = '<div class="search-result-item">ไม่พบลูกค้า</div>';
        container.style.display = 'block';
        return;
    }

    container.innerHTML = results.map((c, idx) => `
        <div class="search-result-item" data-index="${idx}">
            <div class="customer-info">
                <span><strong>${esc(c.customerName || '')}</strong></span>
                <span class="loyalty-badge">${(c.currentPoints ?? 0)} แต้ม</span>
            </div>
            <div style="font-size: 0.85em; color: #795548; margin-top: 6px;">
                แลกคูปองได้ ${(c.redeemableCoupons ?? 0)} ใบ | ต้องการอีก ${(c.pointsToNextCoupon ?? 0)} แต้ม
            </div>
        </div>
    `).join('');

    container.style.display = 'block';
    container.querySelectorAll('.search-result-item').forEach(el => {
        el.addEventListener('click', () => {
            const idx = Number(el.dataset.index);
            const customer = latestCustomerSearchResults[idx];
            if (customer) selectCustomer(customer);
        });
    });
}

function hideCustomerSearchResults() {
    const container = $('#customerSearchResults');
    if (container) {
        container.style.display = 'none';
    }
}

function onProductImageChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
        toast('ไฟล์มีขนาดใหญ่เกิน 5 MB');
        e.target.value = '';
        return;
    }
    productImageFile = file;
    const preview = $('#productImagePreview');
    if (preview) {
        preview.src = URL.createObjectURL(file);
    }
}

function clearProductImageSelection() {
    productImageFile = null;
    const fileInput = $('#productImageFile');
    if (fileInput) fileInput.value = '';
    const urlInput = $('#productImageUrl');
    if (urlInput) urlInput.value = '';
    const preview = $('#productImagePreview');
    if (preview) preview.src = DEFAULT_PRODUCT_IMAGE;
}

async function selectCustomer(customer) {
    selectedCustomer = {
        id: customer.customerId ?? customer.id,
        name: customer.customerName ?? customer.name,
        points: customer.currentPoints ?? customer.loyaltyPoints ?? 0
    };
    useLoyaltyCoupon = false;
    hideCustomerSearchResults();

    const input = $('#customerSearch');
    if (input) input.value = selectedCustomer.name;

    await fetchCustomerLoyaltyDetail(selectedCustomer.id);
    updateSelectedCustomerInfo();

    try {
        const summary = await calculateCartSummary();
        updatePaymentSummaryDisplay(summary);
    } catch (error) {
        console.error('Failed to refresh cart summary:', error);
    }
}

async function fetchCustomerLoyaltyDetail(customerId) {
    selectedCustomerDetail = null;
    if (!customerId) return;
    try {
        const response = await fetch(`${API.loyalty}/detail/${customerId}`, {
            cache: 'no-store'
        });
        if (response.ok) {
            selectedCustomerDetail = await response.json();
        }
    } catch (error) {
        console.error('Fetch loyalty detail failed:', error);
    }
}

function updateSelectedCustomerInfo() {
    const infoContainer = $('#selectedCustomerInfo');
    const detailsEl = $('#customerDetails');
    const loyaltyEl = $('#loyaltyInfo');
    if (!infoContainer || !detailsEl || !loyaltyEl) return;

    if (!selectedCustomer) {
        infoContainer.style.display = 'none';
        detailsEl.innerHTML = '';
        loyaltyEl.innerHTML = '';
        return;
    }

    infoContainer.style.display = 'block';
    detailsEl.innerHTML = `
        <div><strong>${esc(selectedCustomer.name)}</strong></div>
        <div style="color:#795548; font-size:0.9em;">แต้มสะสมปัจจุบัน: ${selectedCustomerDetail?.totalPoints ?? selectedCustomer.points ?? 0}</div>
    `;

    if (selectedCustomerDetail) {
        const totalPoints = selectedCustomerDetail.totalPoints ?? selectedCustomerDetail.currentPoints ?? 0;
        const availableCoupons = Math.floor(totalPoints / 100);
        const remainder = totalPoints % 100;
        const pointsNeeded = remainder === 0 ? 100 : 100 - remainder;
        const buttonLabel = useLoyaltyCoupon ? 'ยกเลิกการใช้คูปอง' : `ใช้คูปองส่วนลด (เหลือ ${availableCoupons} ใบ)`;
        const buttonClass = useLoyaltyCoupon ? 'btn btn-danger' : 'btn btn-success';

        loyaltyEl.innerHTML = `
            <div>แต้มสะสมทั้งหมด: <strong>${totalPoints}</strong></div>
            <div>คูปองที่แลกได้: <strong>${availableCoupons}</strong></div>
            <div>แต้มที่ต้องการสำหรับคูปองถัดไป: <strong>${pointsNeeded}</strong></div>
            ${availableCoupons > 0 ? `<button type="button" class="${buttonClass}" id="btnToggleCoupon" style="margin-top:12px;">${buttonLabel}</button>` : '<div style="margin-top:10px; color:#8d6e63;">แต้มยังไม่พอสำหรับคูปอง</div>'}
        `;

        if (availableCoupons > 0) {
            const btn = $('#btnToggleCoupon');
            if (btn) btn.addEventListener('click', toggleUseCoupon);
        }
    } else {
        loyaltyEl.innerHTML = '<div style="color:#8d6e63;">ไม่สามารถดึงข้อมูลแต้มสะสมได้</div>';
    }
}

async function toggleUseCoupon() {
    useLoyaltyCoupon = !useLoyaltyCoupon;
    updateSelectedCustomerInfo();
    try {
        const summary = await calculateCartSummary();
        updatePaymentSummaryDisplay(summary);
    } catch (error) {
        console.error('Failed to recalculate cart with coupon:', error);
    }
}

function clearSelectedCustomer() {
    selectedCustomer = null;
    selectedCustomerDetail = null;
    useLoyaltyCoupon = false;
    latestCustomerSearchResults = [];
    const input = $('#customerSearch');
    if (input) input.value = '';
    hideCustomerSearchResults();
    updateSelectedCustomerInfo();
    currentCartSummary = null;
    updatePaymentSummaryDisplay();
}

window.clearSelectedCustomer = clearSelectedCustomer;

async function calculateCartSummary() {
    if (cart.length === 0) {
        currentCartSummary = {
            subtotal: 0,
            discount: 0,
            total: 0,
            stockAvailable: true,
            loyaltyPointsEarned: 0
        };
        return currentCartSummary;
    }

    const params = new URLSearchParams();
    if (selectedCustomer?.id) params.append('customerId', selectedCustomer.id);
    if (useLoyaltyCoupon) params.append('useCoupon', 'true');

    const url = `${API.cart}/calculate${params.toString() ? `?${params.toString()}` : ''}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mapCartItemsForPayload())
    });

    if (!response.ok) {
        throw new Error(await response.text());
    }

    currentCartSummary = await response.json();
    return currentCartSummary;
}

function mapCartItemsForPayload() {
    return cart.map(item => ({
        productId: item.id,
        productName: item.name,
        imageUrl: item.imageUrl,
        price: Number(item.price || 0),
        quantity: Number(item.quantity || 0),
        subtotal: Number((item.price || 0) * (item.quantity || 0))
    }));
}

function updatePaymentSummaryDisplay(summary = currentCartSummary) {
    const totalValue = summary?.total ?? cart.reduce((s, i) => s + i.price * i.quantity, 0);
    $('#paymentModalTotal').textContent = fmtBaht(totalValue);

    const discountEl = $('#loyaltyDiscount');
    if (discountEl) {
        const discount = summary?.discount ?? 0;
        if (discount > 0) {
            discountEl.style.display = 'block';
            $('#discountAmount').textContent = fmtBaht(discount);
        } else {
            discountEl.style.display = 'none';
        }
    }

    const totalField = $('#totalAmount');
    if (totalField) {
        totalField.value = `฿${fmtBaht(totalValue)}`;
        totalField.dataset.rawValue = totalValue;
    }

    const qrAmount = $('#qrAmount');
    if (qrAmount) {
        qrAmount.textContent = fmtBaht(totalValue);
    }
}

// Authentication functions
async function checkAuthentication() {
    sessionToken = localStorage.getItem('sessionToken');
    const storedUser = localStorage.getItem('currentUser');

    if (!sessionToken || !storedUser) {
        return false;
    }

    try {
        // Validate session with server
        const response = await fetch(`${API.auth}/validate`, {
            headers: {
                'Authorization': sessionToken
            }
        });

        const result = await response.json();

        if (result.valid) {
            currentUser = JSON.parse(storedUser);
            updateUserDisplay();
            return true;
        } else {
            // Session invalid, clear local storage
            localStorage.removeItem('sessionToken');
            localStorage.removeItem('currentUser');
            return false;
        }
    } catch (error) {
        console.error('Authentication check failed:', error);
        localStorage.removeItem('sessionToken');
        localStorage.removeItem('currentUser');
        return false;
    }
}

function updateUserDisplay() {
    if (currentUser) {
        const roleText = currentUser.role === 'ADMIN' ? 'ผู้ดูแลระบบ' :
                        currentUser.role === 'MANAGER' ? 'ผู้จัดการ' : 'พนักงานขาย';
        $('#currentUserDisplay').textContent = `👤 ${roleText}: ${currentUser.fullName}`;
    }
}

function redirectToLogin() {
    window.location.href = '/login.html';
}

async function logout() {
    if (confirm('ต้องการออกจากระบบใช่หรือไม่?')) {
        try {
            if (sessionToken) {
                await fetch(`${API.auth}/logout`, {
                    method: 'POST',
                    headers: {
                        'Authorization': sessionToken
                    }
                });
            }
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            // Clear local storage and redirect
            localStorage.removeItem('sessionToken');
            localStorage.removeItem('currentUser');
            sessionToken = null;
            currentUser = null;
            redirectToLogin();
        }
    }
}

// Add Authorization header to all API requests
const originalFetch = window.fetch;
window.fetch = function(url, options = {}) {
    if (url.startsWith('/api/') && sessionToken && !url.includes('/auth/')) {
        options.headers = {
            ...options.headers,
            'Authorization': sessionToken
        };
    }
    return originalFetch(url, options);
};

async function initializeApp() {
    await Promise.all([loadSettings(), loadProducts(), loadCustomers()]);
    updateSearchPlaceholder('pos');
    loadSalesReport();
}

// Settings
async function loadSettings() {
    try {
        const r = await fetch(API.settings);
        settingsCache = r.ok ? await r.json() : {};
        $('#shopName').value = settingsCache.shopName || '';
        $('#shopAddress').value = settingsCache.address || '';
        $('#shopPhone').value = settingsCache.phone || '';
        $('#taxId').value = settingsCache.taxId || '';
        $('#promptpayId').value = settingsCache.promptpayId || '';
    } catch (err) { console.error('Error loading settings:', err); }
}

async function saveSettings() {
    const payload = {
        id: 1,
        shopName: $('#shopName').value.trim(),
        address: $('#shopAddress').value.trim(),
        phone: $('#shopPhone').value.trim(),
        taxId: $('#taxId').value.trim(),
        promptpayId: $('#promptpayId').value.trim()
    };
    try {
        const r = await fetch(API.settings, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!r.ok) throw new Error('Save failed');
        settingsCache = await r.json();
        toast('บันทึกการตั้งค่าแล้ว');
    } catch (err) { toast('บันทึกไม่สำเร็จ'); }
}

// Products
async function loadProducts() {
    try {
        const r = await fetch(API.products);
        products = r.ok ? await r.json() : [];
        renderCategories();
        renderProductsGrid(products);
        renderProductsTable($('#searchInput')?.value.trim().toLowerCase());
    } catch (err) { console.error('Error loading products:', err); }
}

function renderCategories() {
    const cats = ['all', ...new Set(products.map(p => p.category || 'others'))];
    const el = $('#categoryTabs');
    el.innerHTML = cats.map((c, i) => {
        const label = c === 'all' ? 'ทั้งหมด' : getCatName(c);
        return `<div class="category-tab ${i === 0 ? 'active' : ''}" data-category="${c}">${label}</div>`;
    }).join('');
    $$('.category-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            $$('.category-tab').forEach(t => t.classList.remove('active'));
            e.currentTarget.classList.add('active');
            filterProducts($('#searchInput').value.trim().toLowerCase());
        });
    });
}

function renderProductsGrid(list) {
    const grid = $('#productsGrid');
    const sortedList = [...list].sort((a, b) => {
        const countA = productSalesCounts.get(a.id) || 0;
        const countB = productSalesCounts.get(b.id) || 0;
        if (countB !== countA) return countB - countA;
        return (a.name || '').localeCompare(b.name || '', 'th');
    });
    grid.innerHTML = sortedList.length ? sortedList.map(p => {
        const thumbUrl = p.imageUrl || DEFAULT_PRODUCT_IMAGE;
        const thumb = `<img src="${esc(thumbUrl)}" alt="${esc(p.name)}" class="product-thumb-img" onerror="this.src='${DEFAULT_PRODUCT_IMAGE}';">`;
        const isBestSeller = bestSellerProductIds.has(p.id);
        const badge = isBestSeller ? '<div class="product-badge">ขายดี</div>' : '';
        return `
      <div class="product-card" data-id="${p.id}">
        ${badge}
        <div class="product-thumb">${thumb}</div>
        <div class="product-name">${esc(p.name)}</div>
        <div class="product-price">฿${fmtBaht(p.price)}</div>
        <div class="product-stock">คงเหลือ: ${p.stock ?? 0}</div>
      </div>`;
    }).join('') : '<p style="text-align:center; grid-column:1/-1;">ไม่พบเมนู</p>';
    $$('.product-card').forEach(card => card.addEventListener('click', () => addToCart(card.dataset.id)));
}

function renderProductsTable(term = '') {
    const filter = (term || '').toLowerCase();
    const list = filter ? products.filter(p => {
        const name = (p.name || '').toLowerCase();
        const code = (p.code || '').toLowerCase();
        const category = getCatName(p.category).toLowerCase();
        return name.includes(filter) || code.includes(filter) || category.includes(filter);
    }) : products;

    $('#productsTable').innerHTML = list.map(p => `
      <tr>
        <td>${esc(p.code || '')}</td>
        <td><div class="table-product-cell"><img src="${esc(p.imageUrl || 'https://via.placeholder.com/48x48?text=No')}" alt="${esc(p.name)}" class="table-product-image" onerror="this.src='https://via.placeholder.com/48x48?text=No';"> ${esc(p.name)}</div></td>
        <td>฿${fmtBaht(p.price)}</td>
        <td>${p.stock ?? 0}</td>
        <td>${esc(getCatName(p.category))}</td>
        <td>
          <button class="btn btn-secondary" onclick="editProduct(${p.id})">แก้ไข</button>
          <button class="btn btn-danger" onclick="deleteProduct(${p.id})">ลบ</button>
        </td>
      </tr>`).join('');
}

function filterProducts(term) {
    const activeTab = $('.category-tab.active');
    const activeCategory = activeTab ? activeTab.dataset.category : 'all';
    let filtered = products;
    if (activeCategory !== 'all') {
        filtered = filtered.filter(p => (p.category || 'others') === activeCategory);
    }
    if (term) {
        filtered = filtered.filter(p => (p.name || '').toLowerCase().includes(term));
    }
    renderProductsGrid(filtered);
}

function handleGlobalSearch(rawTerm) {
    const term = (rawTerm || '').trim().toLowerCase();
    const activeSection = $('.content-section.active')?.id || 'pos';
    if (activeSection === 'products') {
        renderProductsTable(term);
    } else if (activeSection === 'customers') {
        renderCustomersTable(term);
    } else {
        filterProducts(term);
    }
}

function updateSearchPlaceholder(sectionId) {
    const input = $('#searchInput');
    const header = $('.header');
    if (input) {
        if (sectionId === 'products') {
            input.placeholder = '🔍 ค้นหาเมนู...';
        } else if (sectionId === 'customers') {
            input.placeholder = '🔍 ค้นหาลูกค้า...';
        } else {
            input.placeholder = '🔍 ค้นหาเมนู...';
        }
    }
    if (header) {
        header.classList.toggle('hidden', sectionId === 'reports' || sectionId === 'settings');
    }
}

function refreshProductsGrid() {
    const searchInput = $('#searchInput');
    const term = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const activeTab = $('.category-tab.active');
    if (activeTab) {
        filterProducts(term);
    } else {
        renderProductsGrid(products);
    }
}

function updateBestSellerBadges(orders) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const salesCount = new Map();

    orders.forEach(order => {
        const orderDate = new Date(order.orderDate);
        if (Number.isNaN(orderDate.getTime()) || orderDate < thirtyDaysAgo) return;
        (order.items || []).forEach(item => {
            const productId = item?.product?.id;
            if (productId == null) return;
            const qty = Number(item.quantity || 0);
            if (!Number.isFinite(qty) || qty <= 0) return;
            salesCount.set(productId, (salesCount.get(productId) || 0) + qty);
        });
    });

    const topIds = Array.from(salesCount.entries())
        .sort((a, b) => b[1] - a[1])
        .filter(([, count]) => count > 0)
        .slice(0, 3)
        .map(([id]) => id);

    const newSet = new Set(topIds);
    productSalesCounts = salesCount;
    let changed = newSet.size !== bestSellerProductIds.size;
    if (!changed) {
        for (const id of newSet) {
            if (!bestSellerProductIds.has(id)) {
                changed = true;
                break;
            }
        }
    }

    if (changed) {
        bestSellerProductIds = newSet;
    }

    refreshProductsGrid();
}

function openProductModal(p = null) {
    $('#productModalTitle').textContent = p ? '✏️ แก้ไขเมนู' : '➕ เพิ่มเมนูใหม่';
    $('#productForm').dataset.id = p?.id || '';
    $('#productCode').value = p?.code || '';
    $('#productName').value = p?.name || '';
    $('#productPrice').value = p?.price ?? '';
    $('#productStock').value = p?.stock ?? '';
    $('#productCategory').value = p?.category || 'drinks';
    productImageFile = null;
    const url = p?.imageUrl || '';
    $('#productImageUrl').value = url;
    const fileInput = $('#productImageFile');
    if (fileInput) fileInput.value = '';
    const preview = $('#productImagePreview');
    if (preview) preview.src = url || DEFAULT_PRODUCT_IMAGE;
    showModal('productModal');
}

window.editProduct = (id) => openProductModal(products.find(x => x.id === id));

async function saveProduct(e) {
    e.preventDefault();
    const id = $('#productForm').dataset.id;
    let imageUrl = $('#productImageUrl').value.trim();

    if (productImageFile) {
        const formData = new FormData();
        formData.append('file', productImageFile);
        try {
            const uploadResponse = await fetch('/api/uploads/products', {
                method: 'POST',
                body: formData
            });
            if (!uploadResponse.ok) {
                throw new Error('Upload failed');
            }
            const uploadResult = await uploadResponse.json();
            imageUrl = uploadResult.url;
        } catch (err) {
            console.error('Upload error:', err);
            toast('อัปโหลดรูปภาพไม่สำเร็จ');
            return;
        }
    }

    const payload = {
        code: $('#productCode').value.trim(),
        name: $('#productName').value.trim(),
        price: parseFloat($('#productPrice').value || 0),
        stock: parseInt($('#productStock').value || 0),
        category: $('#productCategory').value,
        imageUrl: imageUrl
    };
    try {
        const r = await fetch(id ? `${API.products}/${id}` : API.products, {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!r.ok) throw new Error('Save product failed');
        closeModal('productModal');
        await loadProducts();
        clearProductImageSelection();
    } catch (err) { toast('บันทึกเมนูไม่สำเร็จ'); }
}

window.deleteProduct = async (id) => {
    if (!confirm('ต้องการลบเมนูนี้ใช่หรือไม่?')) return;
    try {
        const r = await fetch(`${API.products}/${id}`, { method: 'DELETE' });
        if (r.ok) {
            toast('ลบเมนูสำเร็จ');
            await loadProducts();
        } else {
            const errText = await r.text();
            toast(`ลบเมนูไม่สำเร็จ: ${errText}\n\nหมายเหตุ: อาจเป็นเพราะสินค้าถูกใช้ในรายการขายแล้ว`);
        }
    } catch (err) { toast('เกิดข้อผิดพลาดในการลบเมนู'); }
}

// Customers
async function loadCustomers() {
    try {
        const r = await fetch(API.customers, { cache: 'no-store' });
        customers = r.ok ? await r.json() : [];
        renderCustomersTable($('#searchInput')?.value.trim().toLowerCase());
    } catch (err) { console.error('Error loading customers:', err); }
}

function renderCustomersTable(term = '') {
    const filter = (term || '').toLowerCase();
    const list = filter ? customers.filter(c => {
        const name = (c.name || '').toLowerCase();
        const phone = (c.phone || '').toLowerCase();
        const email = (c.email || '').toLowerCase();
        const address = (c.address || '').toLowerCase();
        const code = `c${String(c.id).padStart(3, '0')}`;
        return name.includes(filter) || phone.includes(filter) || email.includes(filter) || address.includes(filter) || code.includes(filter);
    }) : customers;

    $('#customersTable').innerHTML = list.map(c => `
        <tr>
          <td>C${String(c.id).padStart(3, '0')}</td>
          <td>${esc(c.name || '')}</td>
          <td>${esc(c.phone || '')}</td>
          <td>${esc(c.email || '')}</td>
          <td>${esc(c.address || '')}</td>
          <td>${esc(String(c.loyaltyPoints ?? 0))}</td>
          <td>
            <button class="btn btn-secondary" onclick="editCustomer(${c.id})">แก้ไข</button>
            <button class="btn btn-danger" onclick="deleteCustomer(${c.id})">ลบ</button>
          </td>
        </tr>`).join('');
}

function openCustomerModal(c = null) {
    $('#customerModalTitle').textContent = c ? '✏️ แก้ไขข้อมูลลูกค้า' : '➕ เพิ่มลูกค้าใหม่';
    $('#customerForm').dataset.id = c?.id || '';
    $('#customerName').value = c?.name || '';
    $('#customerPhone').value = c?.phone || '';
    $('#customerEmail').value = c?.email || '';
    $('#customerAddress').value = c?.address || '';
    showModal('customerModal');
}

window.editCustomer = (id) => openCustomerModal(customers.find(x => x.id === id));

async function saveCustomer(e) {
    e.preventDefault();
    const id = $('#customerForm').dataset.id;
    const payload = {
        name: $('#customerName').value.trim(),
        phone: $('#customerPhone').value.trim(),
        email: $('#customerEmail').value.trim(),
        address: $('#customerAddress').value.trim()
    };
    try {
        const r = await fetch(id ? `${API.customers}/${id}` : API.customers, {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!r.ok) throw new Error('Save customer failed');
        closeModal('customerModal');
        await loadCustomers();
    } catch (err) { toast('บันทึกลูกค้าไม่สำเร็จ'); }
}

window.deleteCustomer = async (id) => {
    if (!confirm('ต้องการลบข้อมูลลูกค้านี้ใช่หรือไม่?')) return;
    try {
        const r = await fetch(`${API.customers}/${id}`, { method: 'DELETE' });
        if (r.ok) await loadCustomers();
        else toast('ลบข้อมูลลูกค้าไม่สำเร็จ');
    } catch (err) { toast('เกิดข้อผิดพลาดในการลบข้อมูลลูกค้า'); }
}


// Cart
function addToCart(productId) {
    const product = products.find(p => p.id == productId);
    if (!product) return;
    if (product.stock <= 0) return toast('สินค้าหมด');

    const cartItem = cart.find(item => item.id == productId);
    if (cartItem) {
        if (cartItem.quantity < product.stock) {
            cartItem.quantity++;
        } else {
            return toast('สต็อกไม่พอ');
        }
    } else {
        cart.push({ ...product, quantity: 1 });
    }
    renderCart();
}

function renderCart() {
    const cartItemsDiv = $('#cartItems');
    if (cart.length === 0) {
        cartItemsDiv.innerHTML = `<div class="empty-cart"><div class="empty-cart-icon">🐱</div><p>ไม่มีเมนูในตะกร้า</p></div>`;
    } else {
        cartItemsDiv.innerHTML = cart.map(item => `
        <div class="cart-item">
          <div class="cart-item-info">
            <div class="cart-item-thumb"><img src="${esc(item.imageUrl || 'https://via.placeholder.com/40?text=No')}" alt="${esc(item.name)}" onerror="this.src='https://via.placeholder.com/40?text=No';"></div>
            <div>
              <div class="cart-item-name">${esc(item.name)}</div>
              <div class="cart-item-details">฿${fmtBaht(item.price)} x ${item.quantity}</div>
            </div>
          </div>
          <div class="quantity-controls">
            <button class="qty-btn" onclick="changeQuantity(${item.id}, -1)">-</button>
            <span>${item.quantity}</span>
            <button class="qty-btn" onclick="changeQuantity(${item.id}, 1)">+</button>
            <button class="qty-btn qty-btn-remove" onclick="removeFromCart(${item.id})">🗑️</button>
          </div>
        </div>`).join('');
    }
    $('#cartTotal').textContent = fmtBaht(cart.reduce((s, i) => s + i.price * i.quantity, 0));
}

function changeQuantity(productId, delta) {
    const item = cart.find(i => i.id == productId);
    if (!item) return;
    const p = products.find(x => x.id == productId);
    const newQty = item.quantity + delta;
    if (newQty <= 0) {
        removeFromCart(productId);
    } else if (p && newQty <= (p.stock ?? 0)) {
        item.quantity = newQty;
    } else {
        toast('สต็อกไม่พอ');
    }
    renderCart();
}

function removeFromCart(productId) {
    cart = cart.filter(i => i.id != productId);
    renderCart();
}

function clearCart() {
    cart = [];
    renderCart();
    currentCartSummary = null;
    updatePaymentSummaryDisplay();
}

// Payment
async function handlePayment() {
    if (cart.length === 0) return toast('กรุณาเลือกสินค้าก่อนชำระเงิน');

    clearSelectedCustomer();

    const reviewItemsDiv = $('#paymentReviewItems');
    if (cart.length > 0) {
        const items = cart.map((item, index) => {
            const imageUrl = esc(item.imageUrl || DEFAULT_PRODUCT_IMAGE);
            const name = esc(item.name);
            const qty = item.quantity;
            const price = fmtBaht(item.price);
            const total = fmtBaht(item.price * item.quantity);
            return `
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px; background:white; border-radius:10px; padding:8px 10px;">
                    <div style="width:44px; height:44px; border-radius:8px; overflow:hidden; flex-shrink:0; background:#ffffff;">
                        <img src="${imageUrl}" alt="${name}" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='${DEFAULT_PRODUCT_IMAGE}';">
                    </div>
                    <div style="flex:1;">
                        <div style="font-weight:600; color:#3e2723; font-size:0.95em;">${index + 1}. ${name}</div>
                        <div style="font-size:0.85em; color:#795548;">${qty} ชิ้น x ฿${price}</div>
                    </div>
                    <div style="font-weight:600; color:#ff6f00; font-size:0.95em;">฿${total}</div>
                </div>`;
        }).join('');

        reviewItemsDiv.innerHTML = `
            <div style="font-weight:600; margin-bottom:10px; color:#5d4037;">รายการสินค้าในตะกร้า</div>
            <div>${items}</div>
        `;
    } else {
        reviewItemsDiv.innerHTML = '<p style="text-align:center; color:#795548;">ไม่มีสินค้าในตะกร้า</p>';
    }

    try {
        const summary = await calculateCartSummary();
        if (summary?.stockAvailable === false) {
            return toast(summary.errorMessage || 'สินค้าในตะกร้ามีจำนวนไม่เพียงพอ');
        }
        updatePaymentSummaryDisplay(summary);
    } catch (error) {
        console.error('Cart calculation failed:', error);
        return toast('ไม่สามารถคำนวณยอดชำระได้');
    }

    showModal('paymentMethodModal');
}


async function selectPaymentMethod(method) {
    currentPaymentMethod = method;
    closeModal('paymentMethodModal');

    try {
        if (!currentCartSummary) {
            const summary = await calculateCartSummary();
            updatePaymentSummaryDisplay(summary);
        } else {
            updatePaymentSummaryDisplay(currentCartSummary);
        }
    } catch (error) {
        console.error('Failed to refresh cart summary:', error);
    }

    const total = currentCartSummary?.total ?? cart.reduce((s, i) => s + i.price * i.quantity, 0);

    if (method === 'cash') {
        $('#paymentTitle').textContent = '💰 ชำระเงินสด';
        $('#cashPayment').style.display = 'block';
        $('#qrPayment').style.display = 'none';
        $('#cashReceived').value = '';
        $('#changeAmount').value = '';
    } else {
        $('#paymentTitle').textContent = '📱 ชำระผ่าน QR';
        $('#cashPayment').style.display = 'none';
        $('#qrPayment').style.display = 'block';
        $('#qrAmount').textContent = fmtBaht(total);
    }

    const summaryForDisplay = currentCartSummary ? { ...currentCartSummary, total } : { total };
    updatePaymentSummaryDisplay(summaryForDisplay);
    showModal('paymentModal');
}

function calculateChange() {
    const totalField = $('#totalAmount');
    const total = totalField?.dataset?.rawValue ? parseFloat(totalField.dataset.rawValue) : parseFloat((totalField?.value || '').replace(/[^\d.]/g, ''));
    const received = parseFloat($('#cashReceived').value);
    if (Number.isFinite(received) && Number.isFinite(total) && received >= total) {
        $('#changeAmount').value = `฿${fmtBaht(received - total)}`;
    } else {
        $('#changeAmount').value = '';
    }
}

async function processPayment() {
    if (cart.length === 0) return toast('ไม่มีสินค้าในตะกร้า');

    try {
        const summary = await calculateCartSummary();
        if (summary?.stockAvailable === false) {
            return toast(summary.errorMessage || 'สินค้าในตะกร้ามีจำนวนไม่เพียงพอ');
        }
        updatePaymentSummaryDisplay(summary);
    } catch (error) {
        console.error('Cart calculation failed:', error);
        return toast('ไม่สามารถคำนวณยอดชำระได้');
    }

    const payableTotal = currentCartSummary?.total ?? cart.reduce((s, i) => s + i.price * i.quantity, 0);
    if (currentPaymentMethod === 'cash') {
        const received = parseFloat($('#cashReceived').value || 0);
        if (!Number.isFinite(received) || received < payableTotal) {
            return toast('จำนวนเงินไม่เพียงพอ');
        }
    }

    const payload = {
        items: mapCartItemsForPayload(),
        paymentMethod: currentPaymentMethod,
        customerId: selectedCustomer?.id,
        useCoupon: useLoyaltyCoupon
    };

    if (currentPaymentMethod === 'cash') {
        payload.cashReceived = parseFloat($('#cashReceived').value || 0);
    }

    try {
        const response = await fetch(`${API.payment}/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(await response.text());
        const result = await response.json();

        if (!result.success) {
            return toast(result.errorMessage || result.message || 'ชำระเงินไม่สำเร็จ');
        }

        clearCart();
        await loadProducts();
        await loadCustomers();
        currentCartSummary = null;
        updatePaymentSummaryDisplay();
        clearSelectedCustomer();
        closeModal('paymentModal');
        closeModal('paymentMethodModal');

        if (result.receiptHtml) {
            $('#receiptContent').innerHTML = result.receiptHtml;
        } else {
            $('#receiptContent').innerHTML = '<p style="text-align:center;">ชำระเงินสำเร็จ</p>';
        }

        $('#cashReceived').value = '';
        $('#changeAmount').value = '';

        showModal('receiptModal');
    } catch (err) {
        console.error('Payment failed:', err);
        toast('ชำระเงินไม่สำเร็จ\n' + err.message);
    }
}

function renderReceipt(order) {
    const d = new Date(order.orderDate || Date.now());
    const itemsHtml = (order.items || []).map(it => {
        const name = esc((it.product && it.product.name) || 'สินค้า');
        const sum = fmtBaht((it.price || 0) * (it.quantity || 0));
        return `<div class="receipt-item"><span>${name} x ${it.quantity}</span><b>฿${sum}</b></div>`;
    }).join('');
    $('#receiptContent').innerHTML = `
      <div class="receipt-header">
        <div class="receipt-title">🐱 ${esc(settingsCache.shopName || 'Cat Café')}</div>
        <p>${esc(settingsCache.address || '')}</p>
        <p>โทร: ${esc(settingsCache.phone || '')}</p>
      </div>
      <p>ใบเสร็จ: ${esc(order.receiptNo || ('R' + Date.now()))}</p>
      <p>วันที่: ${d.toLocaleString('th-TH')}</p>
      <hr>
      ${itemsHtml}
      <div class="receipt-total">
        <div class="receipt-item"><span>รวม</span><b>฿${fmtBaht(order.totalAmount || 0)}</b></div>
        <div class="receipt-item"><span>ชำระด้วย</span><b>${order.paymentMethod === 'qr' ? 'QR Code' : 'เงินสด'}</b></div>
      </div>
      <p style="text-align:center; margin-top:20px;">ขอบคุณที่ใช้บริการ 💛</p>
    `;
}

// Reports
async function loadSalesReport() {
    const today = new Date();
    const oneYearAgo = new Date();
    oneYearAgo.setDate(today.getDate() - 365);

    const startDate = oneYearAgo.toISOString().split('T')[0];
    const endDate = today.toISOString().split('T')[0];

    try {
        const r = await fetch(`${API.report}?start=${startDate}&end=${endDate}`);
        const data = r.ok ? await r.json() : { orders: [] };
        cachedOrders = data.orders || [];

        updateBestSellerBadges(cachedOrders);
        updateStats(cachedOrders);
        renderAllCharts(cachedOrders);
        populateMonthSelector(cachedOrders);
        renderDailySummary(cachedOrders);

    } catch (err) {
        console.error('Error loading sales report:', err);
    }
}

function updateStats(orders) {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayOrders = orders.filter(o => o.orderDate.startsWith(todayStr));

    const totalSales = todayOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const totalOrders = todayOrders.length;

    let bestSeller = 'N/A';
    if (todayOrders.length > 0) {
        const productCount = todayOrders.flatMap(o => o.items).reduce((acc, item) => {
            const name = item.product.name;
            acc[name] = (acc[name] || 0) + item.quantity;
            return acc;
        }, {});
        if (Object.keys(productCount).length > 0) {
           bestSeller = Object.keys(productCount).reduce((a, b) => productCount[a] > productCount[b] ? a : b);
        }
    }

    $('#totalSales').textContent = `฿${fmtBaht(totalSales)}`;
    $('#totalOrders').textContent = totalOrders;
    $('#bestSeller').textContent = bestSeller;
}

function renderAllCharts(orders) {
    renderSevenDaySalesChart(orders);
    renderBestSellerChart(orders);
    renderMonthlySalesChart(orders);
    renderTimeSlotChart(orders);
}

function renderSevenDaySalesChart(orders) {
    const salesData = {};
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toLocaleDateString('th-TH', { month: 'short', day: 'numeric' });
        salesData[dateStr] = 0;
    }
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    orders.forEach(o => {
        const orderDate = new Date(o.orderDate);
        if (orderDate >= sevenDaysAgo) {
            const dateStr = orderDate.toLocaleDateString('th-TH', { month: 'short', day: 'numeric' });
            if (salesData.hasOwnProperty(dateStr)) {
                salesData[dateStr] += o.totalAmount;
            }
        }
    });

    if (salesChartInstance) salesChartInstance.destroy();
    salesChartInstance = new Chart($('#salesChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: Object.keys(salesData),
            datasets: [{
                label: 'ยอดขาย',
                data: Object.values(salesData),
                borderColor: '#ff9a56',
                backgroundColor: 'rgba(255, 154, 86, 0.2)',
                fill: true,
                tension: 0.3
            }]
        }
    });
}

function renderBestSellerChart(orders) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentOrders = orders.filter(o => new Date(o.orderDate) >= thirtyDaysAgo);

    const productCount = recentOrders.flatMap(o => o.items).reduce((acc, item) => {
        const name = item.product.name;
        acc[name] = (acc[name] || 0) + item.quantity;
        return acc;
    }, {});

    const sortedProducts = Object.entries(productCount)
        .sort(([,a],[,b]) => b-a)
        .slice(0, 5);

    if (bestSellerChartInstance) bestSellerChartInstance.destroy();
    bestSellerChartInstance = new Chart($('#bestSellerChart').getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: sortedProducts.map(p => p[0]),
            datasets: [{
                label: 'จำนวนที่ขายได้',
                data: sortedProducts.map(p => p[1]),
                backgroundColor: ['#ffad56', '#4fc3f7', '#81c784', '#e57373', '#ffd54f'],
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderMonthlySalesChart(orders) {
    const monthLabels = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const monthlySales = Array(12).fill(0);
    const currentYear = new Date().getFullYear();

    orders.forEach(o => {
        const orderDate = new Date(o.orderDate);
        if(orderDate.getFullYear() === currentYear) {
            const month = orderDate.getMonth();
            monthlySales[month] += o.totalAmount;
        }
    });

    if(monthlySalesChartInstance) monthlySalesChartInstance.destroy();
    monthlySalesChartInstance = new Chart($('#monthlySalesChart').getContext('2d'), {
        type: 'bar',
        data: {
            labels: monthLabels,
            datasets:[{
                label: `ยอดขายปี ${currentYear + 543}`,
                data: monthlySales,
                backgroundColor: '#81c784'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderTimeSlotChart(orders) {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayOrders = orders.filter(o => o.orderDate.startsWith(todayStr));
    const timeSlots = {
        '09-11': 0, '11-13': 0, '13-15': 0,
        '15-17': 0, '17-19': 0, '19-21': 0
    };

    todayOrders.forEach(o => {
        const hour = new Date(o.orderDate).getHours();
        if (hour >= 9 && hour < 11) timeSlots['09-11'] += o.totalAmount;
        else if (hour >= 11 && hour < 13) timeSlots['11-13'] += o.totalAmount;
        else if (hour >= 13 && hour < 15) timeSlots['13-15'] += o.totalAmount;
        else if (hour >= 15 && hour < 17) timeSlots['15-17'] += o.totalAmount;
        else if (hour >= 17 && hour < 19) timeSlots['17-19'] += o.totalAmount;
        else if (hour >= 19 && hour < 21) timeSlots['19-21'] += o.totalAmount;
    });

    if(timeSlotChartInstance) timeSlotChartInstance.destroy();
    timeSlotChartInstance = new Chart($('#timeSlotChart').getContext('2d'), {
        type: 'bar',
        data: {
            labels: Object.keys(timeSlots).map(t => t.replace('-', ':00-') + ':00'),
            datasets:[{
                label: 'ยอดขาย',
                data: Object.values(timeSlots),
                backgroundColor: '#4fc3f7'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function populateMonthSelector(orders) {
    const selector = $('#monthSelector');
    const monthSet = new Set();
    orders.forEach(o => {
        monthSet.add(o.orderDate.substring(0, 7)); // YYYY-MM
    });

    const sortedMonths = Array.from(monthSet).sort().reverse();

    selector.innerHTML = '';
    sortedMonths.forEach(monthStr => {
        const [year, month] = monthStr.split('-');
        const date = new Date(year, month - 1);
        const optionText = date.toLocaleDateString('th-TH', { month: 'long', year: 'numeric'});
        const option = new Option(optionText, monthStr);
        selector.add(option);
    });
}

function renderDailySummary(orders) {
    const tableBody = document.querySelector('#dailySummaryReportTable tbody');
    const selectedMonth = $('#monthSelector').value;
    const filteredOrders = orders.filter(o => o.orderDate.startsWith(selectedMonth));

    const dailySummary = filteredOrders.reduce((acc, order) => {
        const date = order.orderDate.split('T')[0];
        if (!acc[date]) {
            acc[date] = { total: 0, count: 0 };
        }
        acc[date].total += order.totalAmount;
        acc[date].count++;
        return acc;
    }, {});

    const sortedDates = Object.keys(dailySummary).sort().reverse();
    if (sortedDates.length > 0) {
        tableBody.innerHTML = sortedDates.map(date => {
            const summary = dailySummary[date];
            const formattedDate = new Date(date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
            return `
                <tr onclick="showDailyDetailReport('${date}')">
                    <td>${formattedDate}</td>
                    <td>${summary.count}</td>
                    <td>฿${fmtBaht(summary.total)}</td>
                </tr>
            `;
        }).join('');
    } else {
        tableBody.innerHTML = '<tr><td colspan="3" style="text-align:center;">ไม่พบข้อมูลการขายสำหรับเดือนที่เลือก</td></tr>';
    }
}

function showTodaysSalesDetails() {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayOrders = cachedOrders.filter(o => o.orderDate.startsWith(todayStr));

    const modalTitle = `สรุปยอดขายวันนี้ (${new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })})`;
    $('#todaysSalesModalTitle').textContent = modalTitle;
    const modalBody = $('#todaysSalesModalBody');

    if (todayOrders.length === 0) {
        modalBody.innerHTML = '<p style="text-align:center;">ยังไม่มีรายการขายสำหรับวันนี้</p>';
        showModal('todaysSalesModal');
        return;
    }

    const itemSummary = {};
    todayOrders.flatMap(o => o.items).forEach(item => {
        const name = item.product.name;
        if (!itemSummary[name]) {
            itemSummary[name] = { quantity: 0, totalSales: 0 };
        }
        itemSummary[name].quantity += item.quantity;
        itemSummary[name].totalSales += item.price * item.quantity;
    });

    const sortedItems = Object.entries(itemSummary).sort((a, b) => b[1].totalSales - a[1].totalSales);

    let totalQuantity = 0;
    let totalSales = 0;

    const tableRows = sortedItems.map(([name, data]) => {
        totalQuantity += data.quantity;
        totalSales += data.totalSales;
        return `
            <tr>
                <td>${esc(name)}</td>
                <td>${data.quantity}</td>
                <td>฿${fmtBaht(data.totalSales)}</td>
            </tr>
        `;
    }).join('');

    const html = `
        <table class="table">
            <thead>
                <tr>
                    <th>สินค้า</th>
                    <th>จำนวน (ชิ้น)</th>
                    <th>ยอดขาย</th>
                </tr>
            </thead>
            <tbody>
                ${tableRows}
            </tbody>
            <tfoot>
                <tr style="font-weight: bold; background: #fff8e1;">
                    <td>รวมทั้งหมด</td>
                    <td>${totalQuantity}</td>
                    <td>฿${fmtBaht(totalSales)}</td>
                </tr>
            </tfoot>
        </table>
    `;

    modalBody.innerHTML = html;
    showModal('todaysSalesModal');
}

function showTodaysOrderDetails() {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayOrders = cachedOrders.filter(o => o.orderDate.startsWith(todayStr));

    if (todayOrders.length === 0) {
        toast('ยังไม่มีออเดอร์สำหรับวันนี้');
        return;
    }

    // 1. Populate Summary Stats
    const totalOrders = todayOrders.length;
    const cashOrders = todayOrders.filter(o => o.paymentMethod === 'cash').length;
    const qrOrders = todayOrders.filter(o => o.paymentMethod === 'qr').length;

    $('#orderSummaryStats').innerHTML = `
        <div class="detail-stat">
            <span class="detail-label">จำนวนออเดอร์รวม</span>
            <span class="detail-value">${totalOrders}</span>
        </div>
        <div class="detail-stat">
            <span class="detail-label">ออเดอร์เงินสด</span>
            <span class="detail-value">${cashOrders}</span>
        </div>
        <div class="detail-stat">
            <span class="detail-label">ออเดอร์ QR Code</span>
            <span class="detail-value">${qrOrders}</span>
        </div>
    `;

    // 2. Render Chart
    renderOrdersByTimeChart(todayOrders);

    // 3. Populate Table
    const tableContainer = $('#todaysOrdersTableContainer');
    const tableHTML = `
        <table class="table">
            <thead>
                <tr>
                    <th>เวลา</th>
                    <th>หมายเลขใบเสร็จ</th>
                    <th>จำนวนรายการ</th>
                    <th>ยอดรวม</th>
                    <th>สถานะ</th>
                </tr>
            </thead>
            <tbody>
                ${todayOrders.map(order => `
                    <tr>
                        <td>${new Date(order.orderDate).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</td>
                        <td>${esc(order.receiptNo)}</td>
                        <td>${order.items.length}</td>
                        <td>฿${fmtBaht(order.totalAmount)}</td>
                        <td>✅ เสร็จสิ้น</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    tableContainer.innerHTML = tableHTML;

    showModal('todaysOrderDetailModal');
}

function renderOrdersByTimeChart(todayOrders) {
    const timeSlots = {};
    const hours = ['09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'];
    hours.forEach(h => timeSlots[h] = 0);

    todayOrders.forEach(o => {
        const hour = String(new Date(o.orderDate).getHours()).padStart(2, '0');
        if(timeSlots.hasOwnProperty(hour)) {
            timeSlots[hour]++;
        }
    });

    if(ordersByTimeChartInstance) ordersByTimeChartInstance.destroy();
    ordersByTimeChartInstance = new Chart($('#ordersByTimeChart').getContext('2d'), {
        type: 'bar',
        data: {
            labels: Object.keys(timeSlots).map(h => `${h}:00`),
            datasets:[{
                label: 'จำนวนออเดอร์',
                data: Object.values(timeSlots),
                backgroundColor: '#ffad56'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });
}


async function showDailyDetailReport(date) {
    const formattedDate = new Date(date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    $('#dailyDetailModalTitle').textContent = `📄 ตารางรายงานการขายสินค้าแบบละเอียด วันที่ ${formattedDate}`;
    const modalBody = $('#dailyDetailModalBody');
    modalBody.innerHTML = '<p style="text-align:center;">กำลังโหลดข้อมูล...</p>';
    showModal('dailyDetailModal');

    const ordersForDate = cachedOrders.filter(o => o.orderDate.startsWith(date));

    if (ordersForDate.length > 0) {
        const detailTable = `
            <table class="table">
                <thead>
                    <tr>
                        <th>เวลา</th>
                        <th>หมายเลขใบเสร็จ</th>
                        <th>รายการ</th>
                        <th>ยอดรวม</th>
                        <th>การชำระ</th>
                    </tr>
                </thead>
                <tbody>
                    ${ordersForDate.map(order => {
                        const orderDate = new Date(order.orderDate);
                        const items = order.items.map(item => `${item.product.name} x ${item.quantity}`).join(',<br>');
                        return `
                            <tr>
                                <td>${orderDate.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</td>
                                <td>${esc(order.receiptNo)}</td>
                                <td>${items}</td>
                                <td>฿${fmtBaht(order.totalAmount)}</td>
                                <td>${esc(order.paymentMethod === 'qr' ? 'QR' : 'เงินสด')}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
        modalBody.innerHTML = detailTable;
    } else {
        modalBody.innerHTML = '<p style="text-align:center;">ไม่พบรายการขายสำหรับวันนี้</p>';
    }
}


// Misc
window.printDailyReport = () => {
    const title = $('#dailyDetailModalTitle').textContent;
    const content = $('#dailyDetailModalBody').innerHTML;
    const pwin = window.open('', 'print_content', 'width=800,height=600');
    pwin.document.open();
    pwin.document.write(`
        <html>
            <head>
                <title>${esc(title)}</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, sans-serif; }
                    table { width: 100%; border-collapse: collapse; }
                    th, td { padding: 8px 12px; border: 1px solid #ddd; text-align: left; }
                    th { background-color: #f2f2f2; }
                </style>
            </head>
            <body>
                <h2>${esc(title)}</h2>
                ${content}
            </body>
        </html>
    `);
    pwin.document.close();
    setTimeout(() => { pwin.print(); pwin.close(); }, 500);
};

window.printReceipt = () => {
    const content = $('#receiptContent').innerHTML;
    const pwin = window.open('', 'print_content', 'width=380,height=500');
    pwin.document.open();
    pwin.document.write(`<html><head><title>ใบเสร็จ</title><style>body{font-family:monospace;font-size:13px;}</style></head><body>${content}</body></html>`);
    pwin.document.close();
    setTimeout(() => { pwin.print(); pwin.close(); }, 500);
};

window.emailReceipt = () => toast('ฟังก์ชันส่งอีเมลยังไม่พร้อมใช้งาน');
