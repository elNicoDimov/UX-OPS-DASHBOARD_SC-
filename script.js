// --- HELPER FUNCTIONS ---
const parseDuration = (str) => {
    if (!str) return 0;
    let hours = 0;
    const lower = str.toLowerCase();
    if (lower.includes('week')) hours += parseInt(lower.match(/(\d+)\s*week/)?.[1] || 0) * 40;
    if (lower.includes('day')) hours += parseInt(lower.match(/(\d+)\s*day/)?.[1] || 0) * 8;
    if (lower.includes('hour')) hours += parseInt(lower.match(/(\d+)\s*hour/)?.[1] || 0);
    return hours || 4;
};

const getQuarter = (dateStr) => {
    if (!dateStr) return "Q4"; 
    const monthMap = { 'ene': 0, 'feb': 1, 'mar': 2, 'abr': 3, 'may': 4, 'jun': 5, 'jul': 6, 'ago': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dic': 11 };
    const parts = dateStr.toLowerCase().split('/');
    const month = parts.length > 1 ? monthMap[parts[1]] : 9; // Default to Oct if parse fails
    if (month < 3) return "Q1";
    if (month < 6) return "Q2";
    if (month < 9) return "Q3";
    return "Q4";
};

// --- CSV PARSER ---
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    // Normalize headers to lowercase to handle TEAM vs team
    const headers = lines[0].trim().split(',').map(h => h.trim().toLowerCase());
    
    // Regex to handle quoted fields containing commas
    const parseLine = (line) => {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        return result;
    };

    return lines.slice(1).map(line => {
        if (!line.trim()) return null; // Skip empty lines
        const values = parseLine(line);
        const row = {};
        
        headers.forEach((header, index) => {
            let val = values[index];
            // Remove surrounding quotes if present
            if (val && val.startsWith('"') && val.endsWith('"')) {
                val = val.slice(1, -1);
            }
            row[header] = val; // Use lowercase key
        });
        return row;
    }).filter(row => row !== null);
}

// --- DATA & CONSTANTS ---
const TEAMS = ["Martechs & Ads", "Onboarding", "Fulfillment", "Quick Commerce", "Plus & Pricing", "Payments", "Food"];

let processedData = []; // Will be populated from CSV/JSON

// --- STATE ---
let currentState = {
    tab: 'Vista General',
    quarter: 'All'
};

// --- RENDER LOGIC ---

let mainChartInstance = null;
let donutChartInstance = null;
let radarChartInstance = null;

async function init() {
    lucide.createIcons();
    renderSidebar();
    
    try {
        // Fetch data.csv instead of data.json
        const response = await fetch('data.csv');
        if (!response.ok) throw new Error('Failed to load data.csv');
        const csvText = await response.text();
        
        const rawData = parseCSV(csvText);
        
        processedData = rawData.map((item, i) => ({
            id: i,
            // Use lowercase keys because we normalized headers in parseCSV
            name: item.name || item.NAME || "Unknown",
            team: item.team || item.TEAM || "Unknown",
            status: item.status || item.STATUS || "Todo",
            type: item.type || item.TYPE || "Mejora",
            duration: item.duration || item.DURATION || "0h",
            date: item.date || item.DATE || "",
            
            // Computed properties
            hours: parseDuration(item.duration || item.DURATION),
            quarter: getQuarter(item.date || item.DATE)
        }));
        
        updateDashboard();
    } catch (error) {
        console.error("Error loading data:", error);
        // Fallback or Error Message
        document.getElementById('dashboard-view').innerHTML = `<div style="padding:40px; text-align:center; color:#ef4444;">
            <h3>Error loading data</h3>
            <p>Make sure 'data.csv' is in the same folder.</p>
            <pre>${error.message}</pre>
        </div>`;
    }
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('collapsed');
}

function switchTab(tabName) {
    currentState.tab = tabName;
    updateDashboard();
}

function setQuarter(q) {
    currentState.quarter = q;
    updateDashboard();
}

function renderSidebar() {
    const container = document.getElementById('team-nav-container');
    container.innerHTML = TEAMS.map(team => `
        <button class="nav-btn" onclick="switchTab('${team}')" id="btn-${team.replace(/\s+/g, '')}">
            <i data-lucide="users"></i>
            <span class="nav-label">${team}</span>
        </button>
    `).join('');
    lucide.createIcons();
}

function updateDashboard() {
    // Update Tab Styling
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active', 'active-main');
        btn.style.color = ''; 
        btn.style.borderLeftColor = '';
    });

    let activeBtn;
    if (currentState.tab === 'Vista General') {
        activeBtn = document.getElementById('btn-general');
        if (activeBtn) activeBtn.classList.add('active-main');
    } else if (currentState.tab === 'Base de Datos') {
        activeBtn = document.getElementById('btn-db');
        if (activeBtn) activeBtn.classList.add('active');
    } else {
        const id = `btn-${currentState.tab.replace(/\s+/g, '')}`;
        activeBtn = document.getElementById(id);
        if (activeBtn) activeBtn.classList.add('active');
    }

    // Update Quarter Buttons
    document.querySelectorAll('.q-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent === currentState.quarter);
    });

    // Update Titles
    document.getElementById('page-title-text').textContent = currentState.tab;
    document.getElementById('page-subtitle-text').textContent = currentState.tab === 'Base de Datos' 
        ? "Registro completo de todas las tareas" 
        : "Performance Metrics & KPIs";

    // View Switching
    const isDb = currentState.tab === 'Base de Datos';
    document.getElementById('dashboard-view').classList.toggle('hidden', isDb);
    document.getElementById('db-view').classList.toggle('hidden', !isDb);

    // Filter Data
    let activeData = processedData;
    if (!isDb && currentState.tab !== 'Vista General') {
        activeData = activeData.filter(p => p.team === currentState.tab);
    }
    if (currentState.quarter !== 'All') {
        activeData = activeData.filter(p => p.quarter === currentState.quarter);
    }

    if (isDb) {
        renderTable(activeData);
    } else {
        renderKPIs(activeData);
        renderCharts(activeData);
    }
}

function renderKPIs(data) {
    const total = data.length;
    const hours = data.reduce((sum, p) => sum + p.hours, 0);
    const done = data.filter(p => p.status === 'Done').length;
    const wip = data.filter(p => p.status === 'WIP').length;
    const todo = data.filter(p => p.status === 'Todo').length;

    document.getElementById('kpi-total').textContent = total;
    document.getElementById('kpi-hours').textContent = `${hours} h`;
    document.getElementById('kpi-avg').textContent = total ? `~${(hours/total).toFixed(1)} h/proy` : '0';
    document.getElementById('kpi-done').textContent = done;
    document.getElementById('kpi-wip').textContent = wip;
}

function renderTable(data) {
    const tbody = document.querySelector('#db-table tbody');
    tbody.innerHTML = data.map(p => `
        <tr>
            <td>
                <div style="font-weight:600; color:#fff;">${p.name}</div>
                <div style="font-size:11px; color:#64748b;">${p.date}</div>
            </td>
            <td style="color:#94a3b8;">${p.team}</td>
            <td><span style="padding:2px 8px; border-radius:4px; background:#0f1115; border:1px solid #2a2d35; color:#cbd5e1; font-size:11px; font-weight:700;">${p.quarter}</span></td>
            <td><span class="badge badge-${p.status}">${p.status}</span></td>
            <td><span class="badge badge-${p.type}">${p.type}</span></td>
            <td style="font-family:monospace; color:#fff; font-weight:600;">${p.hours}h</td>
        </tr>
    `).join('');
}

function renderCharts(data) {
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = '-apple-system, sans-serif';

    // --- MAIN BAR CHART (HORIZONTAL) ---
    const ctxMain = document.getElementById('mainChart').getContext('2d');
    if (mainChartInstance) mainChartInstance.destroy();

    const teams = TEAMS;
    // Short mapping for clean labels
    const shortNames = {
        "Martechs & Ads": "Martech",
        "Onboarding": "Onboarding",
        "Fulfillment": "Fulfillment",
        "Quick Commerce": "QC",
        "Plus & Pricing": "Plus",
        "Payments": "Payments",
        "Food": "Food"
    };

    const barData = currentState.tab === 'Vista General' 
        ? teams.map(t => {
            const subset = data.filter(p => p.team === t);
            return {
                done: subset.filter(p => p.status === 'Done').length,
                wip: subset.filter(p => p.status === 'WIP').length,
                todo: subset.filter(p => p.status === 'Todo').length,
            };
        })
        : [{
            done: data.filter(p => p.status === 'Done').length,
            wip: data.filter(p => p.status === 'WIP').length,
            todo: data.filter(p => p.status === 'Todo').length,
        }];

    const labels = currentState.tab === 'Vista General' 
        ? teams.map(t => shortNames[t]) 
        : ['Estado Actual'];
    
    mainChartInstance = new Chart(ctxMain, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'Done', data: barData.map(d => d.done), backgroundColor: '#10b981', borderRadius: 4 },
                { label: 'WIP', data: barData.map(d => d.wip), backgroundColor: '#FFD400', borderRadius: 4 },
                { label: 'Todo', data: barData.map(d => d.todo), backgroundColor: '#64748b', borderRadius: 4 }
            ]
        },
        options: {
            indexAxis: 'y', // Set horizontal
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { 
                    grid: { color: '#2a2d35' }, 
                    ticks: { color: '#94a3b8' },
                    stacked: true,
                    beginAtZero: true
                },
                y: { 
                    grid: { display: false }, 
                    ticks: { color: '#fff', font: { weight: 'bold' } }, 
                    stacked: true
                }
            },
            plugins: { 
                legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20 } },
                tooltip: {
                    backgroundColor: '#1e2025',
                    borderColor: '#2a2d35',
                    borderWidth: 1,
                    titleColor: '#fff',
                    bodyColor: '#cbd5e1',
                    padding: 12,
                    cornerRadius: 8
                }
            }
        }
    });

    // --- DONUT CHART ---
    const ctxDonut = document.getElementById('donutChart').getContext('2d');
    if (donutChartInstance) donutChartInstance.destroy();
    
    const nuevos = data.filter(p => p.type === 'Nuevo').length;
    const mejoras = data.filter(p => p.type === 'Mejora').length;

    donutChartInstance = new Chart(ctxDonut, {
        type: 'doughnut',
        data: {
            labels: ['Nuevos', 'Mejoras'],
            datasets: [{
                data: [nuevos, mejoras],
                backgroundColor: ['#FA0050', '#a855f7'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { usePointStyle: true } } }
        }
    });

    // --- RADAR CHART (Only on General) ---
    const ctxRadar = document.getElementById('radarChart').getContext('2d');
    const radarContainer = document.getElementById('radar-container');
    
    if (currentState.tab !== 'Vista General') {
        radarContainer.classList.add('hidden');
    } else {
        radarContainer.classList.remove('hidden');
        if (radarChartInstance) radarChartInstance.destroy();

        const rawStats = teams.map(t => {
            const subset = data.filter(p => p.team === t);
            return {
                team: shortNames[t],
                count: subset.length,
                hours: subset.reduce((s, x) => s + x.hours, 0)
            };
        });

        // Normalization Logic to Fix "Small/Broken" Shape
        const maxCount = Math.max(...rawStats.map(d => d.count)) || 1;
        const maxHours = Math.max(...rawStats.map(d => d.hours)) || 1;

        const normalizedCount = rawStats.map(d => (d.count / maxCount) * 100);
        const normalizedHours = rawStats.map(d => (d.hours / maxHours) * 100);

        radarChartInstance = new Chart(ctxRadar, {
            type: 'radar',
            data: {
                labels: teams.map(t => shortNames[t]),
                datasets: [
                    { 
                        label: 'Volumen (Proyectos)', 
                        data: normalizedCount, 
                        borderColor: '#FA0050', 
                        backgroundColor: 'rgba(250, 0, 80, 0.4)', // Increased opacity
                        pointBackgroundColor: '#FA0050',
                        borderWidth: 2,
                        fill: true
                    },
                    { 
                        label: 'Esfuerzo (Horas)', 
                        data: normalizedHours, 
                        borderColor: '#00A9E0', 
                        backgroundColor: 'rgba(0, 169, 224, 0.2)',
                        pointBackgroundColor: '#00A9E0',
                        borderWidth: 2,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        min: 0,
                        max: 100, // Explicit 0-100 normalization scale
                        ticks: { display: false }, 
                        grid: { color: '#2a2d35' },
                        angleLines: { color: '#2a2d35' },
                        pointLabels: { color: '#94a3b8', font: { size: 12, weight: 'bold' } }
                    }
                },
                plugins: { 
                    legend: { display: true, position: 'bottom', labels: { boxWidth: 10, padding: 10, font: { size: 10 } } },
                    tooltip: {
                        backgroundColor: '#1e2025',
                        borderColor: '#FA0050',
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {
                            // Custom tooltip to show REAL values
                            label: function(context) {
                                const index = context.dataIndex;
                                const rawItem = rawStats[index];
                                if (context.datasetIndex === 0) {
                                    return `Proyectos: ${rawItem.count}`;
                                } else {
                                    return `Horas: ${rawItem.hours}h`;
                                }
                            }
                        }
                    }
                }
            }
        });
    }
}

// Init
init();