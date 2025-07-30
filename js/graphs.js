// Configuração do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyAROtfqwCp2i2DVqqQDge6QueiNbmlPzuI",
    authDomain: "produtividade-pa.firebaseapp.com",
    projectId: "produtividade-pa",
    storageBucket: "produtividade-pa.appspot.com",
    messagingSenderId: "455228218660",
    appId: "1:455228218660:web:f48ae8a0a03ea1062ca7b1",
    measurementId: "G-3ER0DB83JV"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// Variáveis globais
let currentUser = null;
let operationsData = [];
let filteredData = [];
let currentPage = 1;
const itemsPerPage = 10;
let charts = {
    dailyPerformance: null,
    avgTime: null,
    operationType: null,
    topOperators: null
};

// Elementos da página
const elements = {
    dateRange: document.getElementById('dateRange'),
    operatorSelect: document.getElementById('operatorSelect'),
    operationType: document.getElementById('operationType'),
    applyFiltersBtn: document.getElementById('applyFiltersBtn'),
    resetFiltersBtn: document.getElementById('resetFiltersBtn'),
    currentCount: document.getElementById('currentCount'),
    totalCount: document.getElementById('totalCount'),
    currentPage: document.getElementById('currentPage'),
    prevPageBtn: document.getElementById('prevPageBtn'),
    nextPageBtn: document.getElementById('nextPageBtn'),
    operationsTable: document.getElementById('operationsTable'),
    detailsModal: document.getElementById('detailsModal'),
    operationDetails: document.getElementById('operationDetails'),
    logoutBtn: document.getElementById('logoutBtn'),
    currentUser: document.getElementById('currentUser')
};

// Inicialização da página
document.addEventListener('DOMContentLoaded', () => {
    // Verificar autenticação
    firebase.auth().onAuthStateChanged(user => {
        if (!user) {
            window.location.href = 'index.html';
        } else {
            currentUser = user;
            elements.currentUser.textContent = user.displayName || user.email;
            initializePage();
        }
    });
});

function initializePage() {
    // Configurar date range picker
    $(elements.dateRange).daterangepicker({
        locale: {
            format: 'DD/MM/YYYY',
            applyLabel: 'Aplicar',
            cancelLabel: 'Cancelar',
            fromLabel: 'De',
            toLabel: 'Até',
            customRangeLabel: 'Personalizado',
            daysOfWeek: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
            monthNames: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
            firstDay: 0
        },
        opens: 'left',
        autoUpdateInput: false
    });

    $(elements.dateRange).on('apply.daterangepicker', function(ev, picker) {
        $(this).val(picker.startDate.format('DD/MM/YYYY') + ' - ' + picker.endDate.format('DD/MM/YYYY'));
    });

    // Carregar lista de operadores
    loadOperators();

    // Carregar dados iniciais
    loadOperationsData();

    // Configurar event listeners
    setupEventListeners();
}

function loadOperators() {
    db.ref('funcionarios').once('value')
        .then(snapshot => {
            if (snapshot.exists()) {
                snapshot.forEach(child => {
                    const employee = child.val();
                    const option = document.createElement('option');
                    option.value = employee.codigo;
                    option.textContent = employee.nome;
                    elements.operatorSelect.appendChild(option);
                });
            }
        })
        .catch(error => {
            console.error('Erro ao carregar operadores:', error);
        });
}

function loadOperationsData() {
    // Carregar dados de todas as operações (simulação e shipment)
    const promises = [
        db.ref('operations').once('value'),
        db.ref('shipment_history').once('value')
    ];

    Promise.all(promises)
        .then(([operationsSnapshot, shipmentSnapshot]) => {
            operationsData = [];
            
            // Processar operações de simulação
            if (operationsSnapshot.exists()) {
                operationsSnapshot.forEach(child => {
                    const operation = child.val();
                    operationsData.push({
                        id: child.key,
                        type: operation.type === 'simulation' ? 'Simulação' : 'Locate Load',
                        operatorName: operation.operatorName,
                        date: operation.startTime ? new Date(operation.startTime) : new Date(),
                        endDate: operation.endTime ? new Date(operation.endTime) : null,
                        duration: operation.endTime && operation.startTime ? 
                            Math.floor((operation.endTime - operation.startTime) / 1000) : null,
                        status: operation.status === 'completed' ? 'Concluído' : 'Em Andamento',
                        details: operation,
                        rawType: operation.type
                    });
                });
            }
            
            // Processar operações de shipment
            if (shipmentSnapshot.exists()) {
                shipmentSnapshot.forEach(child => {
                    const shipment = child.val();
                    operationsData.push({
                        id: child.key,
                        type: 'Shipment',
                        operatorName: shipment.operatorName,
                        date: shipment.startTime ? new Date(shipment.startTime) : new Date(),
                        endDate: shipment.endTime ? new Date(shipment.endTime) : null,
                        duration: shipment.totalDuration ? Math.floor(shipment.totalDuration / 1000) : null,
                        status: 'Concluído',
                        details: shipment,
                        rawType: 'shipment'
                    });
                });
            }
            
            // Ordenar por data (mais recente primeiro)
            operationsData.sort((a, b) => b.date - a.date);
            
            // Aplicar filtros iniciais
            applyFilters();
        })
        .catch(error => {
            console.error('Erro ao carregar dados:', error);
        });
}

function setupEventListeners() {
    // Aplicar filtros
    elements.applyFiltersBtn.addEventListener('click', applyFilters);
    
    // Limpar filtros
    elements.resetFiltersBtn.addEventListener('click', resetFilters);
    
    // Paginação
    elements.prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderTable();
        }
    });
    
    elements.nextPageBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(filteredData.length / itemsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            renderTable();
        }
    });
    
    // Logout
    elements.logoutBtn.addEventListener('click', () => {
        firebase.auth().signOut().then(() => {
            window.location.href = 'index.html';
        });
    });
    
    // Fechar modal
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            elements.detailsModal.style.display = 'none';
        });
    });
}

function applyFilters() {
    // Resetar para a primeira página
    currentPage = 1;
    
    // Aplicar filtros
    filteredData = [...operationsData];
    
    // Filtrar por datas
    const dateRange = $(elements.dateRange).data('daterangepicker');
    if (dateRange && dateRange.startDate && dateRange.endDate) {
        const startDate = dateRange.startDate.startOf('day');
        const endDate = dateRange.endDate.endOf('day');
        
        filteredData = filteredData.filter(operation => {
            const opDate = new Date(operation.date);
            return opDate >= startDate && opDate <= endDate;
        });
    }
    
    // Filtrar por operador
    if (elements.operatorSelect.value !== 'all') {
        filteredData = filteredData.filter(operation => {
            // Aqui precisaríamos ter uma forma de relacionar o operador com seu código
            // Como não temos essa relação no seu modelo atual, este filtro precisaria ser ajustado
            return operation.operatorName.includes(elements.operatorSelect.selectedOptions[0].text);
        });
    }
    
    // Filtrar por tipo de operação
    if (elements.operationType.value !== 'all') {
        filteredData = filteredData.filter(operation => {
            return operation.rawType === elements.operationType.value;
        });
    }
    
    // Atualizar UI
    updateUI();
}

function resetFilters() {
    // Resetar controles
    $(elements.dateRange).val('');
    elements.operatorSelect.value = 'all';
    elements.operationType.value = 'all';
    
    // Aplicar filtros (que agora serão vazios)
    applyFilters();
}

function updateUI() {
    // Atualizar contagem
    elements.totalCount.textContent = filteredData.length;
    
    // Atualizar tabela
    renderTable();
    
    // Atualizar gráficos
    updateCharts();
    
    // Atualizar paginação
    updatePagination();
}

function renderTable() {
    const tbody = elements.operationsTable.querySelector('tbody');
    tbody.innerHTML = '';
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, filteredData.length);
    
    elements.currentCount.textContent = `${startIndex + 1}-${endIndex}`;
    
    for (let i = startIndex; i < endIndex; i++) {
        const operation = filteredData[i];
        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td>${formatDate(operation.date)}</td>
            <td>${operation.operatorName || 'N/A'}</td>
            <td>${operation.type}</td>
            <td>
                <button class="view-details-btn" data-id="${operation.id}">
                    <i class="fas fa-eye"></i> Ver Detalhes
                </button>
            </td>
            <td>${operation.duration ? formatTime(operation.duration) : 'N/A'}</td>
            <td><span class="status-badge ${operation.status === 'Concluído' ? 'completed' : 'in-progress'}">${operation.status}</span></td>
        `;
        
        tbody.appendChild(row);
    }
    
    // Adicionar event listeners para os botões de detalhes
    document.querySelectorAll('.view-details-btn').forEach(btn => {
        btn.addEventListener('click', () => showOperationDetails(btn.dataset.id));
    });
}

function updatePagination() {
    const totalPages = Math.ceil(filteredData.length / itemsPerPage);
    
    elements.currentPage.textContent = currentPage;
    elements.prevPageBtn.disabled = currentPage <= 1;
    elements.nextPageBtn.disabled = currentPage >= totalPages;
}

function updateCharts() {
    // Dados para os gráficos
    const dailyData = getDailyPerformanceData();
    const avgTimeData = getAvgTimeData();
    const typeDistributionData = getTypeDistributionData();
    const topOperatorsData = getTopOperatorsData();
    
    // Atualizar ou criar gráficos
    updateDailyPerformanceChart(dailyData);
    updateAvgTimeChart(avgTimeData);
    updateOperationTypeChart(typeDistributionData);
    updateTopOperatorsChart(topOperatorsData);
}

function getDailyPerformanceData() {
    // Agrupar dados por dia
    const dailyGroups = {};
    
    filteredData.forEach(operation => {
        if (!operation.date) return;
        
        const dateStr = operation.date.toISOString().split('T')[0];
        
        if (!dailyGroups[dateStr]) {
            dailyGroups[dateStr] = {
                date: new Date(dateStr),
                count: 0,
                totalDuration: 0
            };
        }
        
        dailyGroups[dateStr].count++;
        if (operation.duration) {
            dailyGroups[dateStr].totalDuration += operation.duration;
        }
    });
    
    // Converter para array e ordenar
    const result = Object.values(dailyGroups).sort((a, b) => a.date - b.date);
    
    return result;
}

function getAvgTimeData() {
    // Calcular tempo médio por tipo de operação
    const typeGroups = {};
    
    filteredData.forEach(operation => {
        if (!operation.duration) return;
        
        if (!typeGroups[operation.type]) {
            typeGroups[operation.type] = {
                type: operation.type,
                count: 0,
                totalDuration: 0
            };
        }
        
        typeGroups[operation.type].count++;
        typeGroups[operation.type].totalDuration += operation.duration;
    });
    
    // Calcular médias
    const result = Object.values(typeGroups).map(group => ({
        type: group.type,
        avgDuration: Math.round(group.totalDuration / group.count)
    }));
    
    return result;
}

function getTypeDistributionData() {
    // Contar operações por tipo
    const typeCounts = {};
    
    filteredData.forEach(operation => {
        if (!typeCounts[operation.type]) {
            typeCounts[operation.type] = 0;
        }
        typeCounts[operation.type]++;
    });
    
    return typeCounts;
}

function getTopOperatorsData() {
    // Agrupar por operador
    const operatorGroups = {};
    
    filteredData.forEach(operation => {
        if (!operation.operatorName) return;
        
        if (!operatorGroups[operation.operatorName]) {
            operatorGroups[operation.operatorName] = {
                name: operation.operatorName,
                count: 0,
                totalDuration: 0
            };
        }
        
        operatorGroups[operation.operatorName].count++;
        if (operation.duration) {
            operatorGroups[operation.operatorName].totalDuration += operation.duration;
        }
    });
    
    // Converter para array, calcular média e ordenar
    const result = Object.values(operatorGroups)
        .map(op => ({
            name: op.name,
            count: op.count,
            avgDuration: Math.round(op.totalDuration / op.count)
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    
    return result;
}

function updateDailyPerformanceChart(data) {
    const ctx = document.getElementById('dailyPerformanceChart').getContext('2d');
    
    // Destruir gráfico existente
    if (charts.dailyPerformance) {
        charts.dailyPerformance.destroy();
    }
    
    // Criar novo gráfico
    charts.dailyPerformance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(item => formatDate(item.date)),
            datasets: [{
                label: 'Operações por Dia',
                data: data.map(item => item.count),
                backgroundColor: 'rgba(54, 162, 235, 0.2)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 2,
                tension: 0.1
            }, {
                label: 'Tempo Médio (min)',
                data: data.map(item => Math.round(item.totalDuration / item.count / 60)),
                backgroundColor: 'rgba(255, 99, 132, 0.2)',
                borderColor: 'rgba(255, 99, 132, 1)',
                borderWidth: 2,
                tension: 0.1,
                yAxisID: 'y1'
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Quantidade de Operações'
                    }
                },
                y1: {
                    beginAtZero: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Tempo Médio (minutos)'
                    },
                    grid: {
                        drawOnChartArea: false
                    }
                }
            }
        }
    });
}

function updateAvgTimeChart(data) {
    const ctx = document.getElementById('avgTimeChart').getContext('2d');
    
    if (charts.avgTime) {
        charts.avgTime.destroy();
    }
    
    charts.avgTime = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(item => item.type),
            datasets: [{
                label: 'Tempo Médio (minutos)',
                data: data.map(item => Math.round(item.avgDuration / 60)),
                backgroundColor: [
                    'rgba(255, 99, 132, 0.7)',
                    'rgba(54, 162, 235, 0.7)',
                    'rgba(255, 206, 86, 0.7)',
                    'rgba(75, 192, 192, 0.7)'
                ],
                borderColor: [
                    'rgba(255, 99, 132, 1)',
                    'rgba(54, 162, 235, 1)',
                    'rgba(255, 206, 86, 1)',
                    'rgba(75, 192, 192, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

function updateOperationTypeChart(data) {
    const ctx = document.getElementById('operationTypeChart').getContext('2d');
    
    if (charts.operationType) {
        charts.operationType.destroy();
    }
    
    charts.operationType = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(data),
            datasets: [{
                data: Object.values(data),
                backgroundColor: [
                    'rgba(255, 99, 132, 0.7)',
                    'rgba(54, 162, 235, 0.7)',
                    'rgba(255, 206, 86, 0.7)',
                    'rgba(75, 192, 192, 0.7)',
                    'rgba(153, 102, 255, 0.7)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

function updateTopOperatorsChart(data) {
    const ctx = document.getElementById('topOperatorsChart').getContext('2d');
    
    if (charts.topOperators) {
        charts.topOperators.destroy();
    }
    
    charts.topOperators = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(item => item.name),
            datasets: [{
                label: 'Quantidade de Operações',
                data: data.map(item => item.count),
                backgroundColor: 'rgba(54, 162, 235, 0.7)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1,
                yAxisID: 'y'
            }, {
                label: 'Tempo Médio (min)',
                data: data.map(item => Math.round(item.avgDuration / 60)),
                backgroundColor: 'rgba(255, 99, 132, 0.7)',
                borderColor: 'rgba(255, 99, 132, 1)',
                borderWidth: 1,
                type: 'line',
                yAxisID: 'y1'
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Quantidade de Operações'
                    }
                },
                y1: {
                    beginAtZero: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Tempo Médio (minutos)'
                    },
                    grid: {
                        drawOnChartArea: false
                    }
                }
            }
        }
    });
}

function showOperationDetails(operationId) {
    const operation = filteredData.find(op => op.id === operationId);
    if (!operation) return;
    
    elements.operationDetails.innerHTML = '';
    
    // Criar elementos de detalhes
    const detailsDiv = document.createElement('div');
    
    // Informações básicas
    const basicInfo = document.createElement('div');
    basicInfo.className = 'detail-section';
    basicInfo.innerHTML = `
        <h3>Informações Básicas</h3>
        <div class="detail-row">
            <div class="detail-label">Tipo:</div>
            <div class="detail-value">${operation.type}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">Operador:</div>
            <div class="detail-value">${operation.operatorName || 'N/A'}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">Data/Hora Início:</div>
            <div class="detail-value">${formatDateTime(operation.date)}</div>
        </div>
        ${operation.endDate ? `
        <div class="detail-row">
            <div class="detail-label">Data/Hora Fim:</div>
            <div class="detail-value">${formatDateTime(operation.endDate)}</div>
        </div>
        ` : ''}
        <div class="detail-row">
            <div class="detail-label">Duração:</div>
            <div class="detail-value">${operation.duration ? formatTime(operation.duration) : 'N/A'}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">Status:</div>
            <div class="detail-value">${operation.status}</div>
        </div>
    `;
    
    detailsDiv.appendChild(basicInfo);
    
    // Detalhes específicos do tipo de operação
    const specificInfo = document.createElement('div');
    specificInfo.className = 'detail-section';
    specificInfo.innerHTML = `<h3>Detalhes da Operação</h3>`;
    
    if (operation.type === 'Simulação' || operation.type === 'Locate Load') {
        specificInfo.innerHTML += `
            <div class="detail-row">
                <div class="detail-label">Nº Surf:</div>
                <div class="detail-value">${operation.details.address || operation.details.surfNumber || 'N/A'}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Destino:</div>
                <div class="detail-value">${operation.details.country || 'N/A'}, ${operation.details.state || 'N/A'}</div>
            </div>
        `;
        
        if (operation.type === 'Simulação' && operation.details.completionType) {
            specificInfo.innerHTML += `
                <div class="detail-row">
                    <div class="detail-label">Tipo de Conclusão:</div>
                    <div class="detail-value">${operation.details.completionType === 'complete' ? 'Completa' : 'Parcial'}</div>
                </div>
            `;
        }
    } else if (operation.type === 'Shipment') {
        specificInfo.innerHTML += `
            <div class="detail-row">
                <div class="detail-label">Nº Shipment:</div>
                <div class="detail-value">${operation.details.shipmentNumber || 'N/A'}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Código SURF:</div>
                <div class="detail-value">${operation.details.surfCode || 'N/A'}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Doca:</div>
                <div class="detail-value">${operation.details.dock || 'N/A'}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Destino:</div>
                <div class="detail-value">${operation.details.destination || 'N/A'}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Tipo de Transporte:</div>
                <div class="detail-value">${getTransportLabel(operation.details.transportType)}</div>
            </div>
            ${operation.details.sealNumber ? `
            <div class="detail-row">
                <div class="detail-label">Nº do Lacre:</div>
                <div class="detail-value">${operation.details.sealNumber}</div>
            </div>
            ` : ''}
        `;
        
        // Mostrar etapas do shipment
        if (operation.details.steps) {
            const stepsDiv = document.createElement('div');
            stepsDiv.className = 'detail-subsection';
            stepsDiv.innerHTML = '<h4>Etapas do Processo</h4>';
            
            const stepsOrder = getStepsOrder(operation.details.transportType);
            stepsOrder.forEach(stepId => {
                const step = operation.details.steps[stepId];
                if (step) {
                    const stepDiv = document.createElement('div');
                    stepDiv.className = 'detail-row';
                    stepDiv.innerHTML = `
                        <div class="detail-label">${step.name}:</div>
                        <div class="detail-value">
                            ${step.status === 'completed' ? 
                                `Concluído em ${formatTime(Math.floor((step.endTime - step.startTime) / 1000))}` : 
                                step.status === 'in_progress' ? 'Em Andamento' : 'Pendente'}
                        </div>
                    `;
                    stepsDiv.appendChild(stepDiv);
                }
            });
            
            specificInfo.appendChild(stepsDiv);
        }
    }
    
    detailsDiv.appendChild(specificInfo);
    elements.operationDetails.appendChild(detailsDiv);
    
    // Mostrar modal
    elements.detailsModal.style.display = 'flex';
}

// Funções auxiliares
function formatDate(date) {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('pt-BR');
}

function formatDateTime(date) {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString('pt-BR');
}

function formatTime(seconds) {
    if (!seconds) return '00:00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function getTransportLabel(transportType) {
    const labels = {
        'maritimo': 'Marítimo',
        'rodoviario': 'Rodoviário',
        'aereo': 'Aéreo (Baú)',
        'sider': 'Sider'
    };
    return labels[transportType] || transportType;
}

function getStepsOrder(transportType) {
    const steps = {
        'maritimo': ['loading', 'awaiting_seal'],
        'rodoviario': ['opening', 'loading', 'closing', 'pre_belt', 'awaiting_seal'],
        'aereo': ['loading', 'awaiting_seal'],
        'sider': ['opening', 'loading', 'closing', 'pre_belt', 'awaiting_seal']
    };
    return steps[transportType] || [];
}