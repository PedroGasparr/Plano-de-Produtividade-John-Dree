// Configuração do Firebase
const db = firebase.database();

// Variáveis globais
let currentUser = null;
let currentScanner = null;
let processes = {};
let timers = {};

// Elementos da página
const elements = {
    // Main elements
    startShipmentProcessBtn: document.getElementById('startShipmentProcessBtn'),
    currentUser: document.getElementById('currentUser'),
    mainActionButtons: document.getElementById('mainActionButtons'),
    processCardsContainer: document.getElementById('processCardsContainer'),
    
    // Modals
    startProcessModal: document.getElementById('startProcessModal'),
    qrCodeModal: document.getElementById('qrCodeModal'),
    sealModal: document.getElementById('sealModal'),
    
    // Start Process Modal
    startProcessScanner: document.getElementById('startProcessScanner'),
    startProcessScannerBtn: document.getElementById('startProcessScannerBtn'),
    operatorName: document.getElementById('operatorName'),
    operatorInfo: document.getElementById('operatorInfo'),
    shipmentNumber: document.getElementById('shipmentNumber'),
    transportType: document.getElementById('transportType'),
    confirmStartProcessBtn: document.getElementById('confirmStartProcessBtn'),
    cancelStartProcessBtn: document.getElementById('cancelStartProcessBtn'),
    startProcessFeedback: document.getElementById('startProcessFeedback'),
    
    // QR Code Modal
    qrCodeModalTitle: document.getElementById('qrCodeModalTitle'),
    qrCodeScanner: document.getElementById('qrCodeScanner'),
    startQrCodeScannerBtn: document.getElementById('startQrCodeScannerBtn'),
    qrCodeOperatorName: document.getElementById('qrCodeOperatorName'),
    qrCodeOperatorInfo: document.getElementById('qrCodeOperatorInfo'),
    confirmQrCodeBtn: document.getElementById('confirmQrCodeBtn'),
    cancelQrCodeBtn: document.getElementById('cancelQrCodeBtn'),
    qrCodeFeedback: document.getElementById('qrCodeFeedback'),
    
    // Seal Modal
    sealNumber: document.getElementById('sealNumber'),
    sealScanner: document.getElementById('sealScanner'),
    startSealScannerBtn: document.getElementById('startSealScannerBtn'),
    confirmSealBtn: document.getElementById('confirmSealBtn'),
    cancelSealBtn: document.getElementById('cancelSealBtn'),
    sealFeedback: document.getElementById('sealFeedback'),
    
    // Others
    logoutBtn: document.getElementById('logoutBtn')
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
            setupEventListeners();
            loadActiveProcesses();
        }
    });
});

function setupEventListeners() {
    // Botão para iniciar processo
    elements.startShipmentProcessBtn.addEventListener('click', () => {
        resetStartProcessForm();
        elements.startProcessModal.style.display = 'flex';
    });
    
    // Modal Iniciar Processo
    elements.startProcessScannerBtn.addEventListener('click', () => startScanner('startProcess'));
    elements.cancelStartProcessBtn.addEventListener('click', () => {
        elements.startProcessModal.style.display = 'none';
        stopScanner();
    });
    elements.confirmStartProcessBtn.addEventListener('click', startShipmentProcess);
    
    // Modal QR Code Genérico
    elements.startQrCodeScannerBtn.addEventListener('click', () => startScanner('generic'));
    elements.cancelQrCodeBtn.addEventListener('click', () => {
        elements.qrCodeModal.style.display = 'none';
        stopScanner();
    });
    elements.confirmQrCodeBtn.addEventListener('click', confirmCurrentStep);
    
    // Modal Lacre
    elements.startSealScannerBtn.addEventListener('click', () => startScanner('seal'));
    elements.cancelSealBtn.addEventListener('click', () => {
        elements.sealModal.style.display = 'none';
        stopScanner();
    });
    elements.confirmSealBtn.addEventListener('click', confirmSeal);
    
    // Logout
    elements.logoutBtn.addEventListener('click', () => {
        firebase.auth().signOut().then(() => {
            window.location.href = 'index.html';
        });
    });
}

function loadActiveProcesses() {
    db.ref('shipment_processes').orderByChild('createdBy').equalTo(currentUser.uid).on('value', snapshot => {
        if (snapshot.exists()) {
            processes = {};
            snapshot.forEach(processSnapshot => {
                const processData = processSnapshot.val();
                processes[processSnapshot.key] = {
                    ...processData,
                    id: processSnapshot.key
                };
                
                // Iniciar temporizador se necessário
                if (!timers[processSnapshot.key] && processData.status === 'in_progress') {
                    startProcessTimer(processSnapshot.key, processData.startTime || Date.now());
                }
            });
            renderProcessCards();
        } else {
            showNoProcessesMessage();
        }
    });
}

function renderProcessCards() {
    elements.processCardsContainer.innerHTML = '';
    
    if (Object.keys(processes).length === 0) {
        showNoProcessesMessage();
        return;
    }
    
    Object.values(processes).forEach(process => {
        const card = createProcessCard(process);
        elements.processCardsContainer.appendChild(card);
    });
}

function createProcessCard(process) {
    const card = document.createElement('div');
    card.className = 'process-card';
    card.dataset.processId = process.id;
    
    // Header
    const header = document.createElement('div');
    header.className = 'process-card-header';
    
    const title = document.createElement('h3');
    title.className = 'process-card-title';
    title.textContent = process.shipmentNumber;
    
    const status = document.createElement('span');
    status.className = `process-card-status ${process.status}`;
    status.textContent = getStatusLabel(process.status);
    
    header.appendChild(title);
    header.appendChild(status);
    
    // Body
    const body = document.createElement('div');
    body.className = 'process-card-body';
    
    const operator = document.createElement('div');
    operator.className = 'process-card-operator';
    operator.textContent = `Operador: ${process.operatorName}`;
    
    const transport = document.createElement('div');
    transport.className = 'process-card-transport';
    transport.textContent = `Transporte: ${process.transportType === 'rodoviario' ? 'Rodoviário' : 'Marítimo'}`;
    
    // Timer
    const timer = document.createElement('div');
    timer.className = 'timer-display';
    timer.innerHTML = `Tempo: <span id="timer-${process.id}">00:00:00</span>`;
    
    // Current step
    const currentStep = document.createElement('div');
    currentStep.className = 'step-title';
    currentStep.textContent = process.currentStep ? 
        getStepName(process.currentStep) : 'Processo concluído';
    
    // Actions
    const actions = document.createElement('div');
    actions.className = 'process-card-actions';
    
    if (process.status === 'completed') {
        const viewBtn = document.createElement('button');
        viewBtn.className = 'btn primary-btn';
        viewBtn.innerHTML = '<i class="fas fa-eye"></i> Visualizar';
        viewBtn.addEventListener('click', () => viewProcessDetails(process.id));
        actions.appendChild(viewBtn);
    } else {
        // Adicionar botões para cada etapa
        addStepButtons(actions, process);
    }
    
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn danger-btn';
    cancelBtn.innerHTML = '<i class="fas fa-times"></i> Cancelar';
    cancelBtn.addEventListener('click', () => cancelProcess(process.id));
    actions.appendChild(cancelBtn);
    
    // Montar card
    body.appendChild(operator);
    body.appendChild(transport);
    body.appendChild(timer);
    body.appendChild(currentStep);
    body.appendChild(actions);
    
    card.appendChild(header);
    card.appendChild(body);
    
    return card;
}

function addStepButtons(container, process) {
    const stepsOrder = getStepsOrder(process.transportType);
    const currentStepIndex = process.currentStep ? stepsOrder.indexOf(process.currentStep) : -1;
    
    if (currentStepIndex === -1) {
        // Processo não iniciado - mostrar botão para primeira etapa
        const startBtn = document.createElement('button');
        startBtn.className = 'btn primary-btn';
        startBtn.innerHTML = '<i class="fas fa-play"></i> Iniciar Processo';
        startBtn.addEventListener('click', () => showQrCodeModal('Iniciar Processo', 'start', process.id));
        container.appendChild(startBtn);
    } else {
        const currentStep = stepsOrder[currentStepIndex];
        const stepData = process.steps[currentStep];
        
        if (stepData.status === 'in_progress') {
            // Mostrar botão para finalizar etapa atual
            const endBtn = document.createElement('button');
            endBtn.className = 'btn primary-btn';
            endBtn.innerHTML = '<i class="fas fa-stop"></i> Finalizar Etapa';
            endBtn.addEventListener('click', () => showQrCodeModal(`Finalizar ${getStepName(currentStep)}`, 'complete', process.id));
            container.appendChild(endBtn);
        } else if (stepData.status === 'pending') {
            // Mostrar botão para iniciar etapa atual
            const startBtn = document.createElement('button');
            startBtn.className = 'btn primary-btn';
            startBtn.innerHTML = '<i class="fas fa-play"></i> Iniciar Etapa';
            startBtn.addEventListener('click', () => showQrCodeModal(`Iniciar ${getStepName(currentStep)}`, 'start', process.id));
            container.appendChild(startBtn);
        }
        
        // Se for etapa de lacre, mostrar botão específico
        if (currentStep === 'awaiting_seal') {
            const sealBtn = document.createElement('button');
            sealBtn.className = 'btn primary-btn';
            sealBtn.innerHTML = '<i class="fas fa-lock"></i> Registrar Lacre';
            sealBtn.addEventListener('click', () => showSealModal(process.id));
            container.appendChild(sealBtn);
        }
        
        // Se houver próxima etapa pendente, mostrar botão para avançar (opcional)
        if (currentStepIndex < stepsOrder.length - 1) {
            const nextStep = stepsOrder[currentStepIndex + 1];
            if (process.steps[nextStep].status === 'pending') {
                const nextBtn = document.createElement('button');
                nextBtn.className = 'btn secondary-btn';
                nextBtn.innerHTML = `<i class="fas fa-arrow-right"></i> ${getStepName(nextStep)}`;
                nextBtn.addEventListener('click', () => showQrCodeModal(`Iniciar ${getStepName(nextStep)}`, 'start', process.id));
                container.appendChild(nextBtn);
            }
        }
    }
}

function showNoProcessesMessage() {

}

function startProcessTimer(processId, startTime) {
    if (timers[processId]) {
        clearInterval(timers[processId]);
    }
    
    const updateTimer = () => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const timerElement = document.getElementById(`timer-${processId}`);
        if (timerElement) {
            timerElement.textContent = formatTime(elapsed);
        }
    };
    
    updateTimer();
    timers[processId] = setInterval(updateTimer, 1000);
}

function showQrCodeModal(title, action, processId) {
    elements.qrCodeModalTitle.textContent = title;
    elements.qrCodeModal.dataset.action = action;
    elements.qrCodeModal.dataset.processId = processId;
    
    // Resetar o modal
    elements.qrCodeOperatorName.textContent = '';
    elements.qrCodeOperatorInfo.style.display = 'none';
    elements.confirmQrCodeBtn.disabled = true;
    elements.qrCodeFeedback.style.display = 'none';
    
    elements.qrCodeModal.style.display = 'flex';
}

function showSealModal(processId) {
    // Resetar o modal
    elements.sealNumber.value = '';
    elements.sealFeedback.style.display = 'none';
    elements.sealModal.dataset.processId = processId;
    
    elements.sealModal.style.display = 'flex';
}

function startScanner(type) {
    stopScanner();
    
    let scannerElement;
    switch (type) {
        case 'startProcess':
            scannerElement = elements.startProcessScanner;
            break;
        case 'generic':
            scannerElement = elements.qrCodeScanner;
            break;
        case 'seal':
            scannerElement = elements.sealScanner;
            break;
    }
    
    scannerElement.style.display = 'block';
    
    currentScanner = new Instascan.Scanner({
        video: scannerElement,
        mirror: false
    });
    
    currentScanner.addListener('scan', content => {
        handleQrScan(content, type);
    });
    
    Instascan.Camera.getCameras()
        .then(cameras => {
            if (cameras.length === 0) {
                throw new Error('Nenhuma câmera encontrada');
            }
            
            const rearCamera = cameras.find(c => c.name.includes('traseira')) || 
                             cameras.find(c => c.facing === 'environment') || 
                             cameras[cameras.length - 1];
            
            return currentScanner.start(rearCamera);
        })
        .catch(error => {
            console.error('Erro ao iniciar scanner:', error);
            showFeedback('Erro ao acessar câmera: ' + error.message, 'error', 
                       type === 'startProcess' ? 'startProcessFeedback' : 
                       type === 'seal' ? 'sealFeedback' : 'qrCodeFeedback');
        });
}

function stopScanner() {
    if (currentScanner) {
        currentScanner.stop();
        currentScanner = null;
    }
    elements.startProcessScanner.style.display = 'none';
    elements.qrCodeScanner.style.display = 'none';
    elements.sealScanner.style.display = 'none';
}

function handleQrScan(content, type) {
    const qrCodeRegex = /^GZL-EO-\d{5}$/;
    if (!qrCodeRegex.test(content)) {
        showFeedback('QR Code inválido! Formato deve ser GZL-EO-XXXXX', 'error', 
                   type === 'startProcess' ? 'startProcessFeedback' : 
                   type === 'seal' ? 'sealFeedback' : 'qrCodeFeedback');
        return;
    }

    showFeedback('Validando QR Code...', 'info', 
               type === 'startProcess' ? 'startProcessFeedback' : 
               type === 'seal' ? 'sealFeedback' : 'qrCodeFeedback');

    db.ref('funcionarios').orderByChild('codigo').equalTo(content).once('value')
        .then(snapshot => {
            if (!snapshot.exists()) {
                throw new Error('Funcionário não encontrado');
            }

            let employeeData = null;
            snapshot.forEach(child => {
                employeeData = child.val();
                return true;
            });

            if (type === 'startProcess') {
                elements.operatorName.textContent = employeeData.nome;
                elements.operatorInfo.style.display = 'block';
                elements.confirmStartProcessBtn.disabled = false;
                showFeedback('Operador validado com sucesso!', 'success', 'startProcessFeedback');
                stopScanner();
            } else if (type === 'seal') {
                elements.sealNumber.value = content;
                showFeedback('QR Code lido com sucesso!', 'success', 'sealFeedback');
                stopScanner();
            } else {
                elements.qrCodeOperatorName.textContent = employeeData.nome;
                elements.qrCodeOperatorInfo.style.display = 'block';
                elements.confirmQrCodeBtn.disabled = false;
                showFeedback('Operador validado com sucesso!', 'success', 'qrCodeFeedback');
                stopScanner();
            }
        })
        .catch(error => {
            console.error('Erro ao validar QR Code:', error);
            showFeedback('Erro: ' + error.message, 'error', 
                       type === 'startProcess' ? 'startProcessFeedback' : 
                       type === 'seal' ? 'sealFeedback' : 'qrCodeFeedback');
        });
}

function startShipmentProcess() {
    const operatorName = elements.operatorName.textContent;
    const shipmentNumber = elements.shipmentNumber.value.trim();
    const transportType = elements.transportType.value;

    if (!operatorName || !shipmentNumber || !transportType) {
        showFeedback('Preencha todos os campos obrigatórios', 'error', 'startProcessFeedback');
        return;
    }

    // Verificar se já existe um processo com este número
    db.ref('shipment_processes').orderByChild('shipmentNumber').equalTo(shipmentNumber).once('value')
        .then(snapshot => {
            if (snapshot.exists()) {
                throw new Error('Já existe um processo com este número de remessa');
            }

            // Criar estrutura do processo
            const steps = {
                truck_opening: { name: 'Abertura do Caminhão', status: 'pending' },
                loading: { name: 'Carregamento do Caminhão', status: 'pending' }
            };

            if (transportType === 'rodoviario') {
                steps.pre_belt = { name: 'Pré-Cinto', status: 'pending' };
            }

            steps.truck_closing = { name: 'Fechamento do Caminhão', status: 'pending' };
            steps.awaiting_seal = { name: 'Aguardando Lacre', status: 'pending' };

            const newProcess = {
                operatorName,
                shipmentNumber,
                transportType,
                status: 'pending',
                steps,
                createdBy: currentUser.uid,
                createdAt: firebase.database.ServerValue.TIMESTAMP
            };

            // Salvar processo
            const processRef = db.ref('shipment_processes').push();
            return processRef.set(newProcess)
                .then(() => {
                    showFeedback('Processo criado com sucesso!', 'success', 'startProcessFeedback');
                    setTimeout(() => {
                        elements.startProcessModal.style.display = 'none';
                        resetStartProcessForm();
                    }, 1500);
                });
        })
        .catch(error => {
            console.error('Erro ao iniciar processo:', error);
            showFeedback('Erro: ' + error.message, 'error', 'startProcessFeedback');
        });
}

function confirmCurrentStep() {
    const action = elements.qrCodeModal.dataset.action;
    const processId = elements.qrCodeModal.dataset.processId;
    const operatorName = elements.qrCodeOperatorName.textContent;
    
    if (!operatorName) {
        showFeedback('Escaneie o QR Code do operador', 'error', 'qrCodeFeedback');
        return;
    }
    
    if (!processes[processId]) {
        showFeedback('Processo não encontrado', 'error', 'qrCodeFeedback');
        return;
    }
    
    elements.confirmQrCodeBtn.disabled = true;
    const processRef = db.ref(`shipment_processes/${processId}`);
    const process = processes[processId];
    
    const updates = {};
    const now = firebase.database.ServerValue.TIMESTAMP;
    const stepsOrder = getStepsOrder(process.transportType);
    
    if (action === 'start') {
        const currentStep = process.currentStep || stepsOrder[0];
        updates[`steps/${currentStep}/status`] = 'in_progress';
        updates[`${currentStep}_startTime`] = now;
        updates.currentStep = currentStep;
        updates.status = 'in_progress';
        
        if (!process.startTime) {
            updates.startTime = now;
        }
    } else if (action === 'complete') {
        const currentStep = process.currentStep;
        updates[`steps/${currentStep}/status`] = 'completed';
        updates[`${currentStep}_endTime`] = now;
        
        // Determinar próxima etapa
        const currentIndex = stepsOrder.indexOf(currentStep);
        const nextStepId = stepsOrder[currentIndex + 1];
        
        if (nextStepId) {
            updates[`steps/${nextStepId}/status`] = 'in_progress';
            updates[`${nextStepId}_startTime`] = now;
            updates.currentStep = nextStepId;
        } else {
            // Todas as etapas concluídas
            updates.status = 'completed';
            updates.endTime = now;
        }
    }
    
    processRef.update(updates)
        .then(() => {
            showFeedback('Operação confirmada com sucesso!', 'success', 'qrCodeFeedback');
            setTimeout(() => {
                elements.qrCodeModal.style.display = 'none';
                
                // Se foi a última etapa, salvar no histórico
                if (action === 'complete' && !updates.currentStep) {
                    saveProcessToHistory(processId);
                }
            }, 1500);
        })
        .catch(error => {
            console.error('Erro ao confirmar etapa:', error);
            showFeedback('Erro: ' + error.message, 'error', 'qrCodeFeedback');
            elements.confirmQrCodeBtn.disabled = false;
        });
}

function confirmSeal() {
    const processId = elements.sealModal.dataset.processId;
    const sealNumber = elements.sealNumber.value.trim();
    
    if (!sealNumber) {
        showFeedback('Informe o número do lacre', 'error', 'sealFeedback');
        return;
    }
    
    if (!processes[processId]) {
        showFeedback('Processo não encontrado', 'error', 'sealFeedback');
        return;
    }
    
    const processRef = db.ref(`shipment_processes/${processId}`);
    const now = firebase.database.ServerValue.TIMESTAMP;
    
    const updates = {
        'steps/awaiting_seal/status': 'completed',
        sealNumber,
        sealAppliedAt: now,
        status: 'completed',
        endTime: now
    };
    
    processRef.update(updates)
        .then(() => {
            showFeedback('Lacre registrado com sucesso!', 'success', 'sealFeedback');
            setTimeout(() => {
                elements.sealModal.style.display = 'none';
                saveProcessToHistory(processId);
            }, 1500);
        })
        .catch(error => {
            console.error('Erro ao registrar lacre:', error);
            showFeedback('Erro: ' + error.message, 'error', 'sealFeedback');
        });
}

function saveProcessToHistory(processId) {
    if (!processes[processId]) return;
    
    const process = processes[processId];
    
    const historyData = {
        processId: process.id,
        operatorName: process.operatorName,
        shipmentNumber: process.shipmentNumber,
        transportType: process.transportType,
        startTime: process.startTime,
        endTime: process.endTime || firebase.database.ServerValue.TIMESTAMP,
        steps: {},
        totalDuration: (process.endTime || Date.now()) - process.startTime,
        sealNumber: process.sealNumber || null,
        sealAppliedAt: process.sealAppliedAt || null
    };
    
    // Calcular tempos para cada etapa
    Object.keys(process.steps).forEach(stepId => {
        historyData.steps[stepId] = {
            name: process.steps[stepId].name,
            startTime: process[`${stepId}_startTime`],
            endTime: process[`${stepId}_endTime`],
            duration: process[`${stepId}_endTime`] - process[`${stepId}_startTime`]
        };
    });
    
    db.ref('shipment_history').push(historyData)
        .then(() => {
            db.ref(`shipment_processes/${processId}`).remove();
        });
}

function cancelProcess(processId) {
    if (!confirm('Tem certeza que deseja cancelar este processo?')) return;
    
    db.ref(`shipment_processes/${processId}`).remove()
        .catch(error => {
            console.error('Erro ao cancelar processo:', error);
            showFeedback('Erro ao cancelar processo: ' + error.message, 'error', 'qrCodeFeedback');
        });
}

function viewProcessDetails(processId) {
    // Implementar visualização de detalhes do processo concluído
    alert(`Visualizar detalhes do processo ${processId}`);
}

// Funções auxiliares
function resetStartProcessForm() {
    elements.shipmentNumber.value = '';
    elements.transportType.value = '';
    elements.operatorName.textContent = '';
    elements.operatorInfo.style.display = 'none';
    elements.confirmStartProcessBtn.disabled = true;
    elements.startProcessFeedback.style.display = 'none';
    stopScanner();
}

function getStepName(stepId) {
    const stepNames = {
        'truck_opening': 'Abertura do Caminhão',
        'loading': 'Carregamento',
        'pre_belt': 'Pré-Cinto',
        'truck_closing': 'Fechamento do Caminhão',
        'awaiting_seal': 'Aguardando Lacre'
    };
    return stepNames[stepId] || stepId;
}

function getStepsOrder(transportType) {
    const baseSteps = [
        'truck_opening',
        'loading',
        'truck_closing',
        'awaiting_seal'
    ];
    
    if (transportType === 'rodoviario') {
        baseSteps.splice(2, 0, 'pre_belt');
    }
    
    return baseSteps;
}

function showFeedback(message, type, elementId) {
    const feedbackElement = document.getElementById(elementId);
    if (!feedbackElement) return;

    feedbackElement.textContent = message;
    feedbackElement.style.display = 'block';
    feedbackElement.className = `feedback ${type}`;
    
    if (type !== 'info') {
        setTimeout(() => {
            feedbackElement.style.display = 'none';
        }, 5000);
    }
}

function formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function getStatusLabel(status) {
    const labels = {
        'pending': 'Pendente',
        'in_progress': 'Em Andamento',
        'completed': 'Concluído'
    };
    return labels[status] || status;
}