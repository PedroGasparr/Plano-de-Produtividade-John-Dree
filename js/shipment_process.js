// Configuração do Firebase
const db = firebase.database();

// Variáveis globais
let currentUser = null;
let currentProcess = null;
let currentScanner = null;
let currentTimer = null;
let stepTimer = null;
let totalTimeInterval = null;
let stepTimeInterval = null;

// Elementos da página
const elements = {
    // Main elements
    startShipmentProcessBtn: document.getElementById('startShipmentProcessBtn'),
    currentUser: document.getElementById('currentUser'),
    mainActionButtons: document.getElementById('mainActionButtons'),
    currentProcessContainer: document.getElementById('currentProcessContainer'),
    currentShipmentNumber: document.getElementById('currentShipmentNumber'),
    currentProcessStatus: document.getElementById('currentProcessStatus'),
    currentStepName: document.getElementById('currentStepName'),
    currentStepActions: document.getElementById('currentStepActions'),
    totalTime: document.getElementById('totalTime'),
    stepTime: document.getElementById('stepTime'),
    cancelProcessBtn: document.getElementById('cancelProcessBtn'),
    
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
            checkActiveProcess();
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
    
    // Cancelar processo
    elements.cancelProcessBtn.addEventListener('click', cancelCurrentProcess);
    
    // Logout
    elements.logoutBtn.addEventListener('click', () => {
        firebase.auth().signOut().then(() => {
            window.location.href = 'index.html';
        });
    });
}

function checkActiveProcess() {
    db.ref('shipment_processes').orderByChild('createdBy').equalTo(currentUser.uid).once('value')
        .then(snapshot => {
            if (snapshot.exists()) {
                snapshot.forEach(processSnapshot => {
                    currentProcess = {
                        id: processSnapshot.key,
                        ...processSnapshot.val()
                    };
                    showCurrentProcess();
                    return true; // Apenas o primeiro processo ativo
                });
            } else {
                showMainScreen();
            }
        });
}

function showMainScreen() {
    elements.mainActionButtons.style.display = 'block';
    elements.currentProcessContainer.style.display = 'none';
}

function showCurrentProcess() {
    elements.mainActionButtons.style.display = 'none';
    elements.currentProcessContainer.style.display = 'block';
    
    // Atualizar informações do processo
    elements.currentShipmentNumber.textContent = currentProcess.shipmentNumber;
    elements.currentProcessStatus.textContent = getStatusLabel(currentProcess.status);
    elements.currentProcessStatus.className = `process-status ${currentProcess.status}`;
    
    // Iniciar temporizador total
    startTotalTimer();
    
    // Mostrar etapa atual
    updateCurrentStepDisplay();
}

function updateCurrentStepDisplay() {
    if (!currentProcess.currentStep) {
        // Processo concluído ou sem etapa atual
        elements.currentStepName.textContent = 'Processo concluído';
        elements.currentStepActions.innerHTML = '';
        return;
    }
    
    const step = currentProcess.steps[currentProcess.currentStep];
    elements.currentStepName.textContent = step.name;
    
    // Limpar ações anteriores
    elements.currentStepActions.innerHTML = '';
    
    // Configurar ações com base na etapa
    switch (currentProcess.currentStep) {
        case 'truck_opening':
            setupTruckOpeningStep();
            break;
        case 'loading':
            setupLoadingStep();
            break;
        case 'truck_closing':
            setupTruckClosingStep();
            break;
        case 'awaiting_seal':
            setupAwaitingSealStep();
            break;
        case 'pre_belt':
            setupPreBeltStep();
            break;
    }
}

function setupTruckOpeningStep() {
    // Verificar se já está em andamento
    if (currentProcess.steps.truck_opening.status === 'in_progress') {
        // Mostrar botão para finalizar abertura
        const endBtn = document.createElement('button');
        endBtn.className = 'btn primary-btn';
        endBtn.innerHTML = '<i class="fas fa-stop"></i> Finalizar Abertura';
        endBtn.addEventListener('click', () => showQrCodeModal('Finalizar Abertura do Caminhão', 'complete'));
        elements.currentStepActions.appendChild(endBtn);
        
        // Iniciar contador da etapa
        startStepTimer(currentProcess.truck_opening_startTime);
    } else {
        // Mostrar botão para iniciar abertura
        const startBtn = document.createElement('button');
        startBtn.className = 'btn primary-btn';
        startBtn.innerHTML = '<i class="fas fa-play"></i> Iniciar Abertura';
        startBtn.addEventListener('click', () => showQrCodeModal('Iniciar Abertura do Caminhão', 'start'));
        elements.currentStepActions.appendChild(startBtn);
    }
}

function setupLoadingStep() {
    if (currentProcess.steps.loading.status === 'in_progress') {
        // Mostrar botão para finalizar carregamento
        const endBtn = document.createElement('button');
        endBtn.className = 'btn primary-btn';
        endBtn.innerHTML = '<i class="fas fa-stop"></i> Finalizar Carregamento';
        endBtn.addEventListener('click', () => showQrCodeModal('Finalizar Carregamento', 'complete'));
        elements.currentStepActions.appendChild(endBtn);
        
        // Iniciar contador da etapa
        startStepTimer(currentProcess.loading_startTime);
    } else {
        // Mostrar botão para iniciar carregamento
        const startBtn = document.createElement('button');
        startBtn.className = 'btn primary-btn';
        startBtn.innerHTML = '<i class="fas fa-play"></i> Iniciar Carregamento';
        startBtn.addEventListener('click', () => showQrCodeModal('Iniciar Carregamento', 'start'));
        elements.currentStepActions.appendChild(startBtn);
    }
}

function setupTruckClosingStep() {
    if (currentProcess.steps.truck_closing.status === 'in_progress') {
        // Mostrar botão para finalizar fechamento
        const endBtn = document.createElement('button');
        endBtn.className = 'btn primary-btn';
        endBtn.innerHTML = '<i class="fas fa-stop"></i> Finalizar Fechamento';
        endBtn.addEventListener('click', () => showQrCodeModal('Finalizar Fechamento do Caminhão', 'complete'));
        elements.currentStepActions.appendChild(endBtn);
        
        // Iniciar contador da etapa
        startStepTimer(currentProcess.truck_closing_startTime);
    } else {
        // Mostrar botão para iniciar fechamento
        const startBtn = document.createElement('button');
        startBtn.className = 'btn primary-btn';
        startBtn.innerHTML = '<i class="fas fa-play"></i> Iniciar Fechamento';
        startBtn.addEventListener('click', () => showQrCodeModal('Iniciar Fechamento do Caminhão', 'start'));
        elements.currentStepActions.appendChild(startBtn);
    }
}

function setupAwaitingSealStep() {
    if (currentProcess.steps.awaiting_seal.status === 'completed') {
        elements.currentStepName.textContent = 'Processo concluído - Aguardando lacre';
    } else {
        // Mostrar botão para registrar lacre
        const sealBtn = document.createElement('button');
        sealBtn.className = 'btn primary-btn';
        sealBtn.innerHTML = '<i class="fas fa-lock"></i> Registrar Lacre';
        sealBtn.addEventListener('click', showSealModal);
        elements.currentStepActions.appendChild(sealBtn);
    }
}

function setupPreBeltStep() {
    if (currentProcess.steps.pre_belt.status === 'in_progress') {
        // Mostrar botão para finalizar pré-cinto
        const endBtn = document.createElement('button');
        endBtn.className = 'btn primary-btn';
        endBtn.innerHTML = '<i class="fas fa-stop"></i> Finalizar Pré-Cinto';
        endBtn.addEventListener('click', () => showQrCodeModal('Finalizar Pré-Cinto', 'complete'));
        elements.currentStepActions.appendChild(endBtn);
        
        // Iniciar contador da etapa
        startStepTimer(currentProcess.pre_belt_startTime);
    } else {
        // Mostrar botão para iniciar pré-cinto
        const startBtn = document.createElement('button');
        startBtn.className = 'btn primary-btn';
        startBtn.innerHTML = '<i class="fas fa-play"></i> Iniciar Pré-Cinto';
        startBtn.addEventListener('click', () => showQrCodeModal('Iniciar Pré-Cinto', 'start'));
        elements.currentStepActions.appendChild(startBtn);
    }
}

function startTotalTimer() {
    if (totalTimeInterval) clearInterval(totalTimeInterval);
    
    const startTime = currentProcess.startTime || Date.now();
    
    const updateTimer = () => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        elements.totalTime.textContent = formatTime(elapsed);
    };
    
    updateTimer();
    totalTimeInterval = setInterval(updateTimer, 1000);
}

function startStepTimer(startTime) {
    if (stepTimeInterval) clearInterval(stepTimeInterval);
    
    const updateTimer = () => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        elements.stepTime.textContent = formatTime(elapsed);
    };
    
    updateTimer();
    stepTimeInterval = setInterval(updateTimer, 1000);
}

function stopStepTimer() {
    if (stepTimeInterval) {
        clearInterval(stepTimeInterval);
        stepTimeInterval = null;
    }
}

function showQrCodeModal(title, action) {
    elements.qrCodeModalTitle.textContent = title;
    elements.qrCodeModal.dataset.action = action;
    
    // Resetar o modal
    elements.qrCodeOperatorName.textContent = '';
    elements.qrCodeOperatorInfo.style.display = 'none';
    elements.confirmQrCodeBtn.disabled = true;
    elements.qrCodeFeedback.style.display = 'none';
    
    elements.qrCodeModal.style.display = 'flex';
}

function showSealModal() {
    // Resetar o modal
    elements.sealNumber.value = '';
    elements.sealFeedback.style.display = 'none';
    
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
                    // Definir como processo atual
                    currentProcess = {
                        id: processRef.key,
                        ...newProcess
                    };
                    return processRef.once('value');
                });
        })
        .then(() => {
            showFeedback('Processo criado com sucesso!', 'success', 'startProcessFeedback');
            setTimeout(() => {
                elements.startProcessModal.style.display = 'none';
                resetStartProcessForm();
                showCurrentProcess();
            }, 1500);
        })
        .catch(error => {
            console.error('Erro ao iniciar processo:', error);
            showFeedback('Erro: ' + error.message, 'error', 'startProcessFeedback');
        });
}

function confirmCurrentStep() {
    const action = elements.qrCodeModal.dataset.action;
    const operatorName = elements.qrCodeOperatorName.textContent;
    
    if (!operatorName) {
        showFeedback('Escaneie o QR Code do operador', 'error', 'qrCodeFeedback');
        return;
    }
    
    elements.confirmQrCodeBtn.disabled = true;
    const processRef = db.ref(`shipment_processes/${currentProcess.id}`);
    
    const updates = {};
    const now = firebase.database.ServerValue.TIMESTAMP;
    const currentStep = currentProcess.currentStep || getFirstStep();
    
    if (action === 'start') {
        // Iniciar etapa
        updates[`steps/${currentStep}/status`] = 'in_progress';
        updates[`${currentStep}_startTime`] = now;
        updates.currentStep = currentStep;
        updates.status = 'in_progress';
        
        if (!currentProcess.startTime) {
            updates.startTime = now;
        }
    } else if (action === 'complete') {
        // Finalizar etapa atual
        updates[`steps/${currentStep}/status`] = 'completed';
        updates[`${currentStep}_endTime`] = now;
        updates.currentStep = null;
        
        // Determinar próxima etapa
        const stepsOrder = getStepsOrder(currentProcess.transportType);
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
                
                // Atualizar processo local e exibição
                db.ref(`shipment_processes/${currentProcess.id}`).once('value')
                    .then(snapshot => {
                        currentProcess = {
                            id: snapshot.key,
                            ...snapshot.val()
                        };
                        updateCurrentStepDisplay();
                        
                        // Se foi a última etapa, salvar no histórico
                        if (action === 'complete' && !updates.currentStep) {
                            saveProcessToHistory();
                        }
                    });
            }, 1500);
        })
        .catch(error => {
            console.error('Erro ao confirmar etapa:', error);
            showFeedback('Erro: ' + error.message, 'error', 'qrCodeFeedback');
            elements.confirmQrCodeBtn.disabled = false;
        });
}

function confirmSeal() {
    const sealNumber = elements.sealNumber.value.trim();
    
    if (!sealNumber) {
        showFeedback('Informe o número do lacre', 'error', 'sealFeedback');
        return;
    }
    
    const processRef = db.ref(`shipment_processes/${currentProcess.id}`);
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
                
                // Atualizar processo local e exibição
                db.ref(`shipment_processes/${currentProcess.id}`).once('value')
                    .then(snapshot => {
                        currentProcess = {
                            id: snapshot.key,
                            ...snapshot.val()
                        };
                        updateCurrentStepDisplay();
                        
                        // Salvar no histórico
                        saveProcessToHistory();
                    });
            }, 1500);
        })
        .catch(error => {
            console.error('Erro ao registrar lacre:', error);
            showFeedback('Erro: ' + error.message, 'error', 'sealFeedback');
        });
}

function saveProcessToHistory() {
    if (!currentProcess) return;
    
    const historyData = {
        processId: currentProcess.id,
        operatorName: currentProcess.operatorName,
        shipmentNumber: currentProcess.shipmentNumber,
        transportType: currentProcess.transportType,
        startTime: currentProcess.startTime,
        endTime: currentProcess.endTime || firebase.database.ServerValue.TIMESTAMP,
        steps: {},
        totalDuration: (currentProcess.endTime || Date.now()) - currentProcess.startTime,
        sealNumber: currentProcess.sealNumber || null,
        sealAppliedAt: currentProcess.sealAppliedAt || null
    };
    
    // Calcular tempos para cada etapa
    Object.keys(currentProcess.steps).forEach(stepId => {
        historyData.steps[stepId] = {
            name: currentProcess.steps[stepId].name,
            startTime: currentProcess[`${stepId}_startTime`],
            endTime: currentProcess[`${stepId}_endTime`],
            duration: currentProcess[`${stepId}_endTime`] - currentProcess[`${stepId}_startTime`]
        };
    });
    
    db.ref('shipment_history').push(historyData)
        .then(() => {
            db.ref(`shipment_processes/${currentProcess.id}`).remove()
                .then(() => {
                    currentProcess = null;
                    showMainScreen();
                });
        });
}

function cancelCurrentProcess() {
    if (!confirm('Tem certeza que deseja cancelar este processo?')) return;
    
    db.ref(`shipment_processes/${currentProcess.id}`).remove()
        .then(() => {
            currentProcess = null;
            showMainScreen();
        })
        .catch(error => {
            console.error('Erro ao cancelar processo:', error);
            showFeedback('Erro ao cancelar processo: ' + error.message, 'error', 'qrCodeFeedback');
        });
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

function getFirstStep() {
    return currentProcess.transportType === 'rodoviario' ? 'truck_opening' : 'truck_opening';
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