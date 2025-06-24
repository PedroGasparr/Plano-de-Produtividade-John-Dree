// Configuração do Firebase
const db = firebase.database();

// Variáveis globais
let currentUser = null;
let activeProcesses = {};
let currentScanner = null;
let currentScannerType = null;

// Elementos da página
const elements = {
    // Botões principais
    startShipmentProcessBtn: document.getElementById('startShipmentProcessBtn'),
    processList: document.getElementById('processList'),
    currentUser: document.getElementById('currentUser'),
    
    // Modal Iniciar Processo
    startProcessModal: document.getElementById('startProcessModal'),
    startProcessScanner: document.getElementById('startProcessScanner'),
    startProcessScannerBtn: document.getElementById('startProcessScannerBtn'),
    operatorName: document.getElementById('operatorName'),
    operatorInfo: document.getElementById('operatorInfo'),
    shipmentNumber: document.getElementById('shipmentNumber'),
    transportType: document.getElementById('transportType'),
    confirmStartProcessBtn: document.getElementById('confirmStartProcessBtn'),
    cancelStartProcessBtn: document.getElementById('cancelStartProcessBtn'),
    startProcessFeedback: document.getElementById('startProcessFeedback'),
    
    // Modal QR Code Genérico
    qrCodeModal: document.getElementById('qrCodeModal'),
    qrCodeModalTitle: document.getElementById('qrCodeModalTitle'),
    qrCodeScanner: document.getElementById('qrCodeScanner'),
    startQrCodeScannerBtn: document.getElementById('startQrCodeScannerBtn'),
    qrCodeOperatorName: document.getElementById('qrCodeOperatorName'),
    qrCodeOperatorInfo: document.getElementById('qrCodeOperatorInfo'),
    confirmQrCodeBtn: document.getElementById('confirmQrCodeBtn'),
    cancelQrCodeBtn: document.getElementById('cancelQrCodeBtn'),
    qrCodeFeedback: document.getElementById('qrCodeFeedback'),
    
    // Outros
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
    
    // Logout
    elements.logoutBtn.addEventListener('click', () => {
        firebase.auth().signOut().then(() => {
            window.location.href = 'index.html';
        });
    });
}

function loadActiveProcesses() {
    db.ref('shipment_processes').on('value', snapshot => {
        activeProcesses = {};
        elements.processList.innerHTML = '';
        
        snapshot.forEach(processSnapshot => {
            const process = processSnapshot.val();
            activeProcesses[processSnapshot.key] = process;
            renderProcess(processSnapshot.key, process);
        });
    });
}

function renderProcess(processId, process) {
    const processElement = document.createElement('div');
    processElement.className = 'process-card';
    processElement.dataset.processId = processId;
    
    const stepsHtml = Object.entries(process.steps).map(([stepId, step]) => {
        const statusClass = step.status === 'completed' ? 'completed' : 
                          step.status === 'in_progress' ? 'in-progress' : 'pending';
        
        const startTime = process[`${stepId}_startTime`] || null;
        const endTime = process[`${stepId}_endTime`] || null;
        
        let timeText = '';
        if (startTime && !endTime) {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            timeText = `⏱️ ${formatTime(elapsed)}`;
        } else if (startTime && endTime) {
            const duration = Math.floor((endTime - startTime) / 1000);
            timeText = `⏱️ ${formatTime(duration)}`;
        }
        
        return `
            <div class="step ${statusClass}">
                <div class="step-header">
                    <span class="step-title">${step.name}</span>
                    <span class="step-status">${getStatusLabel(step.status)}</span>
                </div>
                ${timeText ? `<div class="step-time">${timeText}</div>` : ''}
                ${step.status === 'in_progress' ? `
                <button class="btn primary-btn action-step-btn" data-action="complete" data-step="${stepId}">
                    Finalizar Etapa
                </button>` : ''}
                ${step.status === 'pending' && isNextStep(process, stepId) ? `
                <button class="btn secondary-btn action-step-btn" data-action="start" data-step="${stepId}">
                    Iniciar Etapa
                </button>` : ''}
            </div>
        `;
    }).join('');
    
    processElement.innerHTML = `
        <div class="process-header">
            <h3>${process.shipmentNumber} (${process.transportType === 'maritimo' ? 'Marítimo' : 'Rodoviário'})</h3>
            <div class="process-status ${process.status}">${getStatusLabel(process.status)}</div>
        </div>
        <div class="process-steps">
            ${stepsHtml}
        </div>
        ${process.status === 'in_progress' ? `
        <div class="process-actions">
            <button class="btn danger-btn cancel-process-btn">Cancelar Processo</button>
        </div>` : ''}
    `;
    
    // Adicionar event listeners para os botões de ação
    processElement.querySelectorAll('.action-step-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            const stepId = e.target.dataset.step;
            handleStepAction(processId, stepId, action);
        });
    });
    
    // Adicionar event listener para cancelar processo
    const cancelBtn = processElement.querySelector('.cancel-process-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            if (confirm('Tem certeza que deseja cancelar este processo?')) {
                cancelProcess(processId);
            }
        });
    }
    
    elements.processList.appendChild(processElement);
}

function isNextStep(process, stepId) {
    const stepsOrder = getStepsOrder(process.transportType);
    const currentIndex = stepsOrder.indexOf(stepId);
    
    // Verificar se todas as etapas anteriores estão completas
    for (let i = 0; i < currentIndex; i++) {
        const prevStepId = stepsOrder[i];
        if (process.steps[prevStepId].status !== 'completed') {
            return false;
        }
    }
    
    // Verificar se esta etapa ainda está pendente
    return process.steps[stepId].status === 'pending';
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

function handleStepAction(processId, stepId, action) {
    const processRef = db.ref(`shipment_processes/${processId}`);
    
    if (action === 'start') {
        // Iniciar etapa
        const updates = {
            [`steps/${stepId}/status`]: 'in_progress',
            [`${stepId}_startTime`]: firebase.database.ServerValue.TIMESTAMP,
            currentStep: stepId
        };
        
        processRef.update(updates)
            .then(() => {
                showQrCodeModal(`Confirmar início: ${activeProcesses[processId].steps[stepId].name}`, processId, stepId, 'start');
            });
    } else if (action === 'complete') {
        // Finalizar etapa
        showQrCodeModal(`Confirmar conclusão: ${activeProcesses[processId].steps[stepId].name}`, processId, stepId, 'complete');
    }
}

function startScanner(type) {
    stopScanner();
    currentScannerType = type;
    
    let scannerElement = type === 'startProcess' ? elements.startProcessScanner : elements.qrCodeScanner;
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
                       type === 'startProcess' ? 'startProcessFeedback' : 'qrCodeFeedback');
        });
}

function stopScanner() {
    if (currentScanner) {
        currentScanner.stop();
        currentScanner = null;
    }
    elements.startProcessScanner.style.display = 'none';
    elements.qrCodeScanner.style.display = 'none';
}

function handleQrScan(content, type) {
    const qrCodeRegex = /^GZL-EO-\d{5}$/;
    if (!qrCodeRegex.test(content)) {
        showFeedback('QR Code inválido! Formato deve ser GZL-EO-XXXXX', 'error', 
                   type === 'startProcess' ? 'startProcessFeedback' : 'qrCodeFeedback');
        return;
    }

    showFeedback('Validando QR Code...', 'info', 
               type === 'startProcess' ? 'startProcessFeedback' : 'qrCodeFeedback');

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
                       type === 'startProcess' ? 'startProcessFeedback' : 'qrCodeFeedback');
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
            return processRef.set(newProcess);
        })
        .then(() => {
            showFeedback('Processo criado com sucesso!', 'success', 'startProcessFeedback');
            setTimeout(() => {
                elements.startProcessModal.style.display = 'none';
                resetStartProcessForm();
            }, 1500);
        })
        .catch(error => {
            console.error('Erro ao iniciar processo:', error);
            showFeedback('Erro: ' + error.message, 'error', 'startProcessFeedback');
        });
}

function showQrCodeModal(title, processId, stepId, action) {
    elements.qrCodeModalTitle.textContent = title;
    elements.qrCodeModal.dataset.processId = processId;
    elements.qrCodeModal.dataset.stepId = stepId;
    elements.qrCodeModal.dataset.action = action;
    
    // Resetar o modal
    elements.qrCodeOperatorName.textContent = '';
    elements.qrCodeOperatorInfo.style.display = 'none';
    elements.confirmQrCodeBtn.disabled = true;
    elements.qrCodeFeedback.style.display = 'none';
    
    elements.qrCodeModal.style.display = 'flex';
}

function confirmCurrentStep() {
    const processId = elements.qrCodeModal.dataset.processId;
    const stepId = elements.qrCodeModal.dataset.stepId;
    const action = elements.qrCodeModal.dataset.action;
    const operatorName = elements.qrCodeOperatorName.textContent;
    
    if (!operatorName) {
        showFeedback('Escaneie o QR Code do operador', 'error', 'qrCodeFeedback');
        return;
    }
    
    elements.confirmQrCodeBtn.disabled = true;
    const processRef = db.ref(`shipment_processes/${processId}`);
    
    const updates = {};
    const now = firebase.database.ServerValue.TIMESTAMP;
    
    if (action === 'start') {
        // Confirmar início do processo
        updates.status = 'in_progress';
        updates.startTime = now;
        updates.startConfirmedBy = operatorName;
        updates.startConfirmedAt = now;
        
        // Iniciar primeira etapa
        const firstStepId = getStepsOrder(activeProcesses[processId].transportType)[0];
        updates[`steps/${firstStepId}/status`] = 'in_progress';
        updates[`${firstStepId}_startTime`] = now;
        updates.currentStep = firstStepId;
    } 
    else if (action === 'complete') {
        // Finalizar etapa atual
        updates[`steps/${stepId}/status`] = 'completed';
        updates[`${stepId}_endTime`] = now;
        updates[`${stepId}_endConfirmedBy`] = operatorName;
        updates[`${stepId}_endConfirmedAt`] = now;
        updates.currentStep = null;
        
        // Iniciar próxima etapa se houver
        const stepsOrder = getStepsOrder(activeProcesses[processId].transportType);
        const currentIndex = stepsOrder.indexOf(stepId);
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
            }, 1500);
            
            // Se foi a última etapa, salvar no histórico
            if (action === 'complete' && !updates.currentStep) {
                saveProcessToHistory(processId);
            }
        })
        .catch(error => {
            console.error('Erro ao confirmar etapa:', error);
            showFeedback('Erro: ' + error.message, 'error', 'qrCodeFeedback');
            elements.confirmQrCodeBtn.disabled = false;
        });
}

function saveProcessToHistory(processId) {
    const process = activeProcesses[processId];
    if (!process) return;
    
    const historyData = {
        processId,
        operatorName: process.operatorName,
        shipmentNumber: process.shipmentNumber,
        transportType: process.transportType,
        startTime: process.startTime,
        endTime: process.endTime || firebase.database.ServerValue.TIMESTAMP,
        steps: {},
        totalDuration: (process.endTime || Date.now()) - process.startTime
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
    db.ref(`shipment_processes/${processId}`).remove()
        .then(() => {
            showFeedback('Processo cancelado com sucesso!', 'success', 'qrCodeFeedback');
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