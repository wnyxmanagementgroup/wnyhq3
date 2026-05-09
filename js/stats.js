// --- STATS FUNCTIONS (REVISED) ---

let lastStatsLoadTime = 0;
const STATS_CACHE_DURATION = 5 * 60 * 1000; // Cache 5 นาที

// 1. ฟังก์ชันโหลดข้อมูลหลัก
async function loadStatsData(forceRefresh = false) {
    try {
        console.log("🔄 Loading stats data...");
        const user = getCurrentUser();
        if (!user) return;
        const roleName = String(user.role || '').toLowerCase();
        const canAccessStats = roleName === 'admin' || roleName === 'director';
        if (!canAccessStats) {
            const container = document.getElementById('stats-overview');
            if (container) {
                container.innerHTML = `
                    <div class="text-center p-8 text-red-500 border rounded-lg bg-red-50">
                        <p class="font-bold">ไม่มีสิทธิ์เข้าถึงหน้าสถิติข้อมูล</p>
                        <p class="text-sm mb-4">หน้านี้เปิดใช้งานเฉพาะแอดมินและผู้อำนวยการโรงเรียน</p>
                    </div>`;
            }
            return;
        }

        // Reset UI ชั่วคราว
        const container = document.getElementById('stats-overview');
        
        // เช็ค Cache (ถ้าไม่กด Refresh และเวลาไม่เกิน 5 นาที ให้ใช้ข้อมูลเดิม)
        const now = Date.now();
        const canUseFullCache = window.allRequestsCacheScope === 'all' && window.allMemosCacheScope === 'all';
        if (!forceRefresh && canUseFullCache && (now - lastStatsLoadTime < STATS_CACHE_DURATION) && allRequestsCache.length > 0) {
             console.log("⚡ Using cached stats data");
             const userRequests = user.role === 'admin' ? allRequestsCache : allRequestsCache.filter(req => req.username === user.username);
             const userMemos = user.role === 'admin' ? allMemosCache : userMemosCache; 
             renderStatsOverview(userRequests, userMemos, allUsersCache, user);
             return;
        }

        // แสดง Loader
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12">
                <div class="loader mb-4"></div>
                <p class="text-gray-500 font-medium">กำลังประมวลผลข้อมูลสถิติ...</p>
            </div>`;
        document.getElementById('stats-charts')?.classList.add('hidden');

        // ดึงข้อมูลพร้อมกัน 3 ส่วน
        const [requestsResult, memosResult, usersResult] = await Promise.all([
            apiCall('GET', 'getAllRequests').catch(() => ({ status: 'error', data: [] })),
            apiCall('GET', 'getAllMemos').catch(() => ({ status: 'error', data: [] })),
            apiCall('GET', 'getAllUsers').catch(() => ({ status: 'error', data: [] }))
        ]);

        // อัปเดต Cache
        if(requestsResult.status === 'success') {
            allRequestsCache = requestsResult.data || [];
            window.allRequestsCacheScope = 'all';
        }
        if(memosResult.status === 'success') {
            allMemosCache = memosResult.data || [];
            window.allMemosCacheScope = 'all';
        }
        if(usersResult.status === 'success') allUsersCache = usersResult.data || [];
        
        lastStatsLoadTime = Date.now();

        // กรองข้อมูลตามสิทธิ์ (User/Admin)
        const requests = allRequestsCache;
        const memos = allMemosCache;
        const users = allUsersCache;

        const userRequests = user.role === 'admin' ? requests : requests.filter(req => req.username === user.username);
        const userMemos = user.role === 'admin' ? memos : memos.filter(memo => memo.submittedBy === user.username);

        // ส่งไปแสดงผล
        renderStatsOverview(userRequests, userMemos, users, user);

    } catch (error) {
        console.error('❌ Error loading stats:', error);
        document.getElementById('stats-overview').innerHTML = `
            <div class="text-center p-8 text-red-500 border rounded-lg bg-red-50">
                <p class="font-bold">เกิดข้อผิดพลาดในการโหลดข้อมูล</p>
                <p class="text-sm mb-4">${error.message}</p>
                <button onclick="loadStatsData(true)" class="btn btn-primary">ลองอีกครั้ง</button>
            </div>`;
    }
}

// 2. ฟังก์ชันแสดงผลหน้าจอ (Layout & UI)
function renderStatsOverview(requests, memos, users, currentUser) {
    const stats = calculateStats(requests, memos, users, currentUser);
    const container = document.getElementById('stats-overview');
    
    // สร้าง Layout HTML
    container.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            ${createStatCard('คำขอทั้งหมด', stats.totalRequests, 'text-blue-600', 'bg-blue-100', '📋')}
            ${createStatCard('ดำเนินการเสร็จสิ้น', stats.completedRequests, 'text-green-600', 'bg-green-100', '✅')}
            ${createStatCard('บันทึกข้อความ', stats.totalMemos, 'text-purple-600', 'bg-purple-100', '📤')}
            ${createStatCard('ผู้ใช้งานในระบบ', stats.totalUsers, 'text-orange-600', 'bg-orange-100', '👥')}
        </div>

        <div id="stats-charts" class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 page-view">
            <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col" style="min-height: 350px;">
                <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center">
                    <span class="w-1 h-6 bg-indigo-500 rounded mr-2"></span>
                    สถิติรายเดือน (6 เดือนล่าสุด)
                </h3>
                <div class="flex-1 relative w-full h-full">
                    <canvas id="requests-chart"></canvas>
                </div>
            </div>

            <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col" style="min-height: 350px;">
                <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center">
                    <span class="w-1 h-6 bg-pink-500 rounded mr-2"></span>
                    สัดส่วนสถานะการดำเนินการ
                </h3>
                <div class="flex-1 relative w-full h-full flex justify-center items-center">
                    <canvas id="status-chart"></canvas>
                </div>
            </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div class="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                <h3 class="font-bold text-gray-700">รายการล่าสุด 5 รายการ</h3>
                <button onclick="switchPage('dashboard-page')" class="text-sm text-indigo-600 hover:underline">ดูทั้งหมด</button>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm text-left text-gray-600">
                    <thead class="text-xs text-gray-700 uppercase bg-gray-100">
                        <tr>
                            <th class="px-4 py-3">วันที่</th>
                            <th class="px-4 py-3">เรื่อง/วัตถุประสงค์</th>
                            <th class="px-4 py-3 text-center">สถานะ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${requests.slice(0, 5).map(req => `
                            <tr class="border-b hover:bg-gray-50 transition">
                                <td class="px-4 py-3 whitespace-nowrap font-medium text-gray-900">${formatDisplayDate(req.startDate)}</td>
                                <td class="px-4 py-3 truncate max-w-xs">${escapeHtml(req.purpose)}</td>
                                <td class="px-4 py-3 text-center">
                                    <span class="px-2 py-1 rounded-full text-xs font-semibold 
                                        ${req.status.includes('เสร็จสิ้น') || req.status === 'Approved' ? 'bg-green-100 text-green-700' : 
                                          req.status.includes('แก้ไข') ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}">
                                        ${translateStatus(req.status)}
                                    </span>
                                </td>
                            </tr>
                        `).join('') || '<tr><td colspan="3" class="px-4 py-8 text-center text-gray-400">ยังไม่มีข้อมูล</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    // สร้างกราฟ (ต้องรอให้ DOM เรนเดอร์เสร็จก่อนเล็กน้อย)
    setTimeout(() => { createCharts(stats); }, 100);
}

// Helper สร้าง Card HTML
function createStatCard(title, value, textColor, bgColor, icon) {
    return `
        <div class="stat-card bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center transition hover:shadow-md">
            <div class="p-3 rounded-full ${bgColor} mr-4 text-2xl">
                ${icon}
            </div>
            <div>
                <p class="text-sm text-gray-500 mb-1">${title}</p>
                <p class="text-2xl font-bold ${textColor}">${value}</p>
            </div>
        </div>
    `;
}

// 3. ฟังก์ชันสร้างกราฟ (Chart.js)
function createCharts(stats) {
    // ล้างกราฟเก่าถ้ามี
    if (window.requestsChartInstance) { window.requestsChartInstance.destroy(); window.requestsChartInstance = null; }
    if (window.statusChartInstance) { window.statusChartInstance.destroy(); window.statusChartInstance = null; }

    // 3.1 กราฟแท่ง (Bar Chart)
    const monthlyCtx = document.getElementById('requests-chart')?.getContext('2d');
    if (monthlyCtx) {
        window.requestsChartInstance = new Chart(monthlyCtx, {
            type: 'bar',
            data: {
                labels: stats.monthlyStats.map(m => m.month),
                datasets: [{
                    label: 'จำนวนคำขอ (เรื่อง)',
                    data: stats.monthlyStats.map(m => m.count),
                    backgroundColor: '#6366f1', // Indigo-500
                    borderRadius: 4,
                    barPercentage: 0.6,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false, // สำคัญ: ให้กราฟยืดตาม Container
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        padding: 10,
                        callbacks: {
                            label: function(context) { return `จำนวน: ${context.raw} เรื่อง`; }
                        }
                    }
                },
                scales: {
                    y: { 
                        beginAtZero: true, 
                        grid: { borderDash: [2, 4], color: '#f3f4f6' },
                        ticks: { precision: 0 }
                    },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    // 3.2 กราฟวงกลม (Doughnut Chart)
    const statusCtx = document.getElementById('status-chart')?.getContext('2d');
    if (statusCtx) {
        const labels = Object.keys(stats.requestStatus).map(s => translateStatus(s));
        const data = Object.values(stats.requestStatus);
        
        // ถ้าไม่มีข้อมูลเลย ให้ใส่ Mock data เพื่อให้กราฟไม่ว่างเปล่า
        const isEmpty = data.length === 0 || data.every(v => v === 0);
        
        window.statusChartInstance = new Chart(statusCtx, {
            type: 'doughnut',
            data: {
                labels: isEmpty ? ['ไม่มีข้อมูล'] : labels,
                datasets: [{
                    data: isEmpty ? [1] : data,
                    backgroundColor: isEmpty ? ['#e5e7eb'] : [
                        '#10b981', // green (เสร็จสิ้น)
                        '#f59e0b', // yellow (กำลังดำเนินการ)
                        '#3b82f6', // blue
                        '#ef4444', // red
                        '#8b5cf6', // purple
                        '#f97316'  // orange
                    ],
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: { 
                        position: 'bottom', 
                        labels: { 
                            padding: 20, 
                            usePointStyle: true, 
                            font: { size: 12 } 
                        } 
                    },
                    tooltip: { enabled: !isEmpty }
                }
            }
        });
    }
}

// 4. ฟังก์ชันคำนวณ (Calculation Logic) - หัวใจสำคัญที่แก้ไขบั๊ก
function calculateStats(requests, memos, users, currentUser) {
    // 4.1 สรุปภาพรวม
    const totalRequests = requests.length;
    
    // นับจำนวนสถานะต่างๆ (Normalize key เพื่อป้องกัน case sensitive)
    const requestStatus = {};
    let completedRequests = 0;

    requests.forEach(req => {
        const status = req.status || 'กำลังดำเนินการ';
        requestStatus[status] = (requestStatus[status] || 0) + 1;

        // เช็คเงื่อนไขความสำเร็จให้ครอบคลุม
        if (['เสร็จสิ้น', 'เสร็จสิ้น/รับไฟล์ไปใช้งาน', 'Approved'].includes(status) || 
            (req.commandStatus && req.commandStatus.includes('เสร็จสิ้น'))) {
            completedRequests++;
        }
    });

    const totalMemos = memos.length;
    const totalUsers = users.length;

    // 4.2 คำนวณรายเดือน (ย้อนหลัง 6 เดือน)
    const monthlyStats = [];
    const now = new Date();
    
    for (let i = 5; i >= 0; i--) {
        // สร้างวันที่ย้อนหลัง i เดือน (ใช้วันที่ 1 ของเดือนนั้น)
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        
        // ชื่อเดือนภาษาไทย
        const monthName = d.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
        
        // Filter ข้อมูลในเดือนนี้
        const count = requests.filter(req => {
            // Priority: startDate > timestamp > docDate
            const dateStr = req.startDate || req.timestamp || req.docDate; 
            if (!dateStr) return false;

            // แปลงวันที่ให้ปลอดภัย (Safe parsing)
            const reqDate = safeDateParse(dateStr);
            if (!reqDate) return false;

            return reqDate.getMonth() === d.getMonth() && 
                   reqDate.getFullYear() === d.getFullYear();
        }).length;

        monthlyStats.push({ month: monthName, count: count });
    }

    return {
        totalRequests,
        completedRequests,
        totalMemos,
        totalUsers,
        requestStatus,
        monthlyStats
    };
}

// Helper: แปลงวันที่ให้แม่นยำ ป้องกัน Invalid Date
function safeDateParse(dateInput) {
    if (!dateInput) return null;
    
    // กรณีเป็น Date Object อยู่แล้ว
    if (dateInput instanceof Date) return dateInput;

    // กรณีเป็น String
    try {
        const d = new Date(dateInput);
        if (isNaN(d.getTime())) return null; // Invalid Date check
        return d;
    } catch (e) {
        return null;
    }
}

// 5. ส่งออกรายงาน (Export)
async function exportStatsReport() {
    try {
        const user = getCurrentUser(); if (!user) return;
        toggleLoader('export-stats', true);
        
        // Re-fetch เพื่อความชัวร์
        const [requestsResult, memosResult, usersResult] = await Promise.all([
            apiCall('GET', 'getAllRequests'), 
            apiCall('GET', 'getAllMemos'), 
            apiCall('GET', 'getAllUsers')
        ]);
        
        const requests = requestsResult.data || [];
        const memos = memosResult.data || [];
        const users = usersResult.data || [];
        
        const userRequests = user.role === 'admin' ? requests : requests.filter(req => req.username === user.username);
        const stats = calculateStats(userRequests, memos, users, user);
        
        // เตรียมข้อมูลลง Excel
        const reportData = [
            ['รายงานสถิติระบบไปราชการ', '', '', ''],
            ['วันที่ออกรายงาน', new Date().toLocaleDateString('th-TH'), '', ''],
            [''],
            ['สรุปภาพรวม', '', '', ''],
            ['รายการ', 'จำนวน', '', ''],
            ['คำขอทั้งหมด', stats.totalRequests, '', ''],
            ['เสร็จสิ้น', stats.completedRequests, '', ''],
            ['บันทึกข้อความ', stats.totalMemos, '', ''],
            ['ผู้ใช้งาน', stats.totalUsers, '', ''],
            [''],
            ['สถิติรายเดือน (6 เดือนล่าสุด)', '', '', ''],
            ['เดือน', 'จำนวนคำขอ', '', '']
        ];

        stats.monthlyStats.forEach(m => {
            reportData.push([m.month, m.count, '', '']);
        });

        // สร้างไฟล์
        const ws = XLSX.utils.aoa_to_sheet(reportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Stats_Report');
        
        // Download
        XLSX.writeFile(wb, `Stats_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
        showAlert('สำเร็จ', 'ส่งออกรายงานเรียบร้อยแล้ว');
        
    } catch (error) {
        console.error(error);
        showAlert('ผิดพลาด', 'ไม่สามารถส่งออกรายงานได้');
    } finally {
        toggleLoader('export-stats', false);
    }
}
