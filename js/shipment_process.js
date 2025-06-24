// Configuração do Firebase
const db = firebase.database();

// Variáveis globais
let currentUser = null;
let currentProcess = null;
let currentScanner = null;
let currentProcessRef = null;
let processSteps = [];
let processTimer = null;

// Elementos da página
const elements = {
    // Botões principais
    startShipmentProcessBtn: document.getElementById('startShipmentProcessBtn'),
    processSteps: document.getElementById('processSteps'),
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
    
    // Fechar modais
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(modal => {
                modal.style.display = 'none';
            });
            stopScanner();
        });
    });
}

function startScanner(type) {
    stopScanner();
    
    let scannerElement;
    if (type === 'startProcess') {
        scannerElement = elements.startProcessScanner;
    } else {
        scannerElement = elements.qrCodeScanner;
    }
    
    scannerElement.style.display = 'block';
    currentScanner = new Instascan.Scanner({
        video: scannerElement,
        mirror: false,
        scanPeriod: 1,
        backgroundScan: false
    });
    
    currentScanner.addListener('scan', content => {
        handleQrScan(content, type);
    });
    
    Instascan.Camera.getCameras()
        .then(cameras => {
            if (cameras.length === 0) {
                throw new Error('Nenhuma câmera encontrada');
            }
            
            // Sempre tentar usar a câmera traseira
            const rearCamera = cameras.find(c => c.name.includes('traseira') || 
                             c.name.includes('rear') || 
                             c.name.includes('back')) || 
                             cameras.find(c => c.facing === 'environment') || 
                             cameras[cameras.length - 1];
            
            return currentScanner.start(rearCamera);
        })
        .then(() => {
            showFeedback('Scanner iniciado com sucesso', 'success', 
                       type === 'startProcess' ? 'startProcessFeedback' : 'qrCodeFeedback');
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

    elements.confirmStartProcessBtn.disabled = true;

    // Definir etapas do processo
    processSteps = [
        { id: 'truck_opening', name: 'Abertura do Caminhão', status: 'pending', startTime: null, endTime: null },
        { id: 'loading', name: 'Carregamento do Caminhão', status: 'pending', startTime: null, endTime: null },
        { id: 'truck_closing', name: 'Fechamento do Caminhão', status: 'pending', startTime: null, endTime: null }
    ];

    // Adicionar pré-cinto apenas para rodoviário
    if (transportType === 'rodoviario') {
        processSteps.splice(3, 0, 
            { id: 'pre_belt', name: 'Pré-Cinto', status: 'pending', startTime: null, endTime: null });
    }

    // Adicionar etapa de aguardo de lacre
    processSteps.push(
        { id: 'awaiting_seal', name: 'Aguardando Lacre', status: 'pending', startTime: null, endTime: null }
    );

    const newProcess = {
        operatorName,
        shipmentNumber,
        transportType,
        status: 'in_progress',
        currentStep: null,
        steps: processSteps.reduce((acc, step) => {
            acc[step.id] = { name: step.name, status: step.status };
            return acc;
        }, {}),
        startTime: firebase.database.ServerValue.TIMESTAMP,
        createdBy: currentUser.uid
    };

    currentProcessRef = db.ref('shipment_processes').push();
    currentProcessRef.set(newProcess)
        .then(() => {
            showFeedback('Processo iniciado com sucesso!', 'success', 'startProcessFeedback');
            setTimeout(() => {
                elements.startProcessModal.style.display = 'none';
                resetStartProcessForm();
                
                // Monitorar mudanças no processo
                currentProcessRef.on('value', snapshot => {
                    if (snapshot.exists()) {
                        currentProcess = snapshot.val();
                        renderProcessSteps();
                    }
                });
                
                // Iniciar primeira etapa
                startNextStep();
            }, 1500);
        })
        .catch(error => {
            console.error('Erro ao iniciar processo:', error);
            showFeedback('Erro ao iniciar processo: ' + error.message, 'error', 'startProcessFeedback');
        })
        .finally(() => {
            elements.confirmStartProcessBtn.disabled = false;
        });
}

function renderProcessSteps() {
    if (!currentProcess) return;
    
    elements.processSteps.innerHTML = '';
    
    Object.entries(currentProcess.steps).forEach(([stepId, step]) => {
        const stepElement = document.createElement('div');
        stepElement.className = 'step';
        stepElement.dataset.stepId = stepId;
        
        const statusClass = step.status === 'completed' ? 'completed' : 
                          step.status === 'in_progress' ? 'in-progress' : 'pending';
        
        const startTime = currentProcess[`${stepId}_startTime`] || null;
        const endTime = currentProcess[`${stepId}_endTime`] || null;
        
        let timeText = '';
        if (startTime && !endTime) {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            timeText = `Tempo decorrido: ${formatTime(elapsed)}`;
        } else if (startTime && endTime) {
            const duration = Math.floor((endTime - startTime) / 1000);
            timeText = `Tempo total: ${formatTime(duration)}`;
        }
        
        stepElement.innerHTML = `
            <div class="step-header">
                <div class="step-title">${step.name}</div>
                <div class="step-status ${statusClass}">${getStatusLabel(step.status)}</div>
            </div>
            ${timeText ? `<div class="step-time">${timeText}</div>` : ''}
            <div class="step-actions" style="display: ${step.status === 'in_progress' ? 'flex' : 'none'}">
                <button class="btn primary-btn finish-step-btn">Finalizar Etapa</button>
            </div>
        `;
        
        elements.processSteps.appendChild(stepElement);
        
        // Adicionar event listener para o botão de finalizar etapa
        if (step.status === 'in_progress') {
            stepElement.querySelector('.finish-step-btn').addEventListener('click', () => {
                showQrCodeModal(`Finalizar ${step.name}`, stepId);
            });
        }
    });
}

function startNextStep() {
    if (!currentProcess) return;
    
    // Encontrar a primeira etapa pendente
    const nextStep = Object.entries(currentProcess.steps).find(([_, step]) => 
        step.status === 'pending');
    
    if (nextStep) {
        const [stepId, step] = nextStep;
        
        // Atualizar status da etapa
        const updates = {
            [`steps/${stepId}/status`]: 'in_progress',
            [`${stepId}_startTime`]: firebase.database.ServerValue.TIMESTAMP,
            currentStep: stepId
        };
        
        currentProcessRef.update(updates)
            .then(() => {
                // Mostrar modal de QR code para iniciar a etapa
                showQrCodeModal(`Iniciar ${step.name}`, stepId);
            });
    } else {
        // Todas as etapas concluídas
        currentProcessRef.update({
            status: 'completed',
            endTime: firebase.database.ServerValue.TIMESTAMP
        }).then(() => {
            saveProcessHistory();
        });
    }
}

function showQrCodeModal(title, stepId) {
    elements.qrCodeModalTitle.textContent = title;
    elements.qrCodeModal.dataset.stepId = stepId;
    
    // Resetar o modal
    elements.qrCodeOperatorName.textContent = '';
    elements.qrCodeOperatorInfo.style.display = 'none';
    elements.confirmQrCodeBtn.disabled = true;
    elements.qrCodeFeedback.style.display = 'none';
    
    elements.qrCodeModal.style.display = 'flex';
}

function confirmCurrentStep() {
    const stepId = elements.qrCodeModal.dataset.stepId;
    const operatorName = elements.qrCodeOperatorName.textContent;
    
    if (!operatorName) {
        showFeedback('Escaneie o QR Code do operador', 'error', 'qrCodeFeedback');
        return;
    }
    
    elements.confirmQrCodeBtn.disabled = true;
    
    // Verificar se estamos iniciando ou finalizando a etapa
    const step = currentProcess.steps[stepId];
    const isStarting = step.status === 'in_progress' && !currentProcess[`${stepId}_startTime`];
    
    const updates = {};
    
    if (isStarting) {
        // Confirmar início da etapa
        updates[`${stepId}_startConfirmedBy`] = operatorName;
        updates[`${stepId}_startConfirmedAt`] = firebase.database.ServerValue.TIMESTAMP;
    } else {
        // Finalizar etapa
        updates[`steps/${stepId}/status`] = 'completed';
        updates[`${stepId}_endTime`] = firebase.database.ServerValue.TIMESTAMP;
        updates[`${stepId}_endConfirmedBy`] = operatorName;
        updates[`${stepId}_endConfirmedAt`] = firebase.database.ServerValue.TIMESTAMP;
        updates.currentStep = null;
    }
    
    currentProcessRef.update(updates)
        .then(() => {
            showFeedback('Operação confirmada com sucesso!', 'success', 'qrCodeFeedback');
            setTimeout(() => {
                elements.qrCodeModal.style.display = 'none';
                
                if (!isStarting) {
                    // Iniciar próxima etapa
                    startNextStep();
                }
            }, 1500);
        })
        .catch(error => {
            console.error('Erro ao confirmar etapa:', error);
            showFeedback('Erro: ' + error.message, 'error', 'qrCodeFeedback');
            elements.confirmQrCodeBtn.disabled = false;
        });
}

function saveProcessHistory() {
    if (!currentProcess || !currentProcessRef) return;
    
    const historyData = {
        processId: currentProcessRef.key,
        operatorName: currentProcess.operatorName,
        shipmentNumber: currentProcess.shipmentNumber,
        transportType: currentProcess.transportType,
        startTime: currentProcess.startTime,
        endTime: currentProcess.endTime,
        steps: {}
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
    
    // Calcular tempo total
    historyData.totalDuration = currentProcess.endTime - currentProcess.startTime;
    
    db.ref('shipment_history').push(historyData)
        .then(() => {
            currentProcessRef.remove();
            currentProcess = null;
            currentProcessRef = null;
            alert('Processo concluído e salvo no histórico!');
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
    
    // Configurar cores baseadas no tipo
    const colors = {
        error: { bg: '#ffebee', text: '#c62828' },
        success: { bg: '#e8f5e9', text: '#2e7d32' },
        info: { bg: '#e3f2fd', text: '#1565c0' }
    };
    
    feedbackElement.style.backgroundColor = colors[type]?.bg || '#f5f5f5';
    feedbackElement.style.color = colors[type]?.text || '#333';
    
    // Esconder após alguns segundos
    if (type !== 'info') {
        setTimeout(() => {
            feedbackElement.style.display = 'none';
        }, 5000);
    }
}

function formatTime(seconds) {
    if (!seconds) return '00:00:00';
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