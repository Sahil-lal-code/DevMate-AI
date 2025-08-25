// Global variables
const SAMPLE_CODES = {
    'python': `# Welcome to DevMate AI\n# Try explaining or running this code\n\ndef factorial(n):\n    """Calculate factorial recursively"""\n    return 1 if n <= 1 else n * factorial(n-1)\n\nprint(factorial(5))`,
    'javascript': `// Welcome to DevMate AI\n// Try explaining or running this code\n\nfunction fibonacci(n) {\n    if (n <= 1) return n;\n    return fibonacci(n - 1) + fibonacci(n - 2);\n}\n\nconsole.log(fibonacci(6));`,
    'java': `// Welcome to DevMate AI\nclass Main {\n    public static void main(String[] args) {\n        System.out.println("Reverse: " + reverseString("Hello"));\n    }\n    \n    static String reverseString(String str) {\n        return new StringBuilder(str).reverse().toString();\n    }\n}`,
    'c': `// Welcome to DevMate AI\n#include <stdio.h>\n\nint max(int a, int b) {\n    return (a > b) ? a : b;\n}\n\nint main() {\n    printf("Max: %d", max(10, 20));\n    return 0;\n}`,
    'c++': `// Welcome to DevMate AI\n#include <iostream>\nusing namespace std;\n\nclass Rectangle {\n    int width, height;\npublic:\n    Rectangle(int w, int h) : width(w), height(h) {}\n    int area() { return width * height; }\n};\n\nint main() {\n    Rectangle rect(3, 4);\n    cout << "Area: " << rect.area();\n    return 0;\n}`
};

const API_BASE_URL = 'http://localhost:3008/api';

// Editor functions
function enhanceEditorTouch() {
    const editorContainer = document.getElementById('monaco-editor');
    let isTouchingEditor = false;

    editorContainer.addEventListener('touchstart', () => {
        isTouchingEditor = true;
    }, { passive: true });

    editorContainer.addEventListener('touchend', () => {
        setTimeout(() => isTouchingEditor = false, 100);
    }, { passive: true });

    document.body.addEventListener('touchmove', (e) => {
        if (isTouchingEditor) e.preventDefault();
    }, { passive: false });
}

function updateSampleCode() {
    if (!window.editor) return;
    
    const language = document.getElementById('language-select').value;
    const currentCode = window.editor.getValue();
    
    if (!currentCode.trim() || Object.values(SAMPLE_CODES).includes(currentCode)) {
        window.editor.setValue(SAMPLE_CODES[language]);
        const monacoLanguage = {
            'python': 'python',
            'javascript': 'javascript',
            'java': 'java',
            'c': 'c',
            'c++': 'cpp'
        }[language];
        monaco.editor.setModelLanguage(window.editor.getModel(), monacoLanguage);
    }
    enhanceEditorTouch();
}

function initializeFontSizeSelector() {
    const fontSizeSelect = document.getElementById('font-size');
    const savedFontSize = localStorage.getItem('editorFontSize') || '14';
    
    fontSizeSelect.value = savedFontSize;
    
    fontSizeSelect.addEventListener('change', (e) => {
        const newSize = e.target.value;
        updateEditorFontSize(newSize);
        localStorage.setItem('editorFontSize', newSize);
    });
}

function updateEditorFontSize(size) {
    if (window.editor) {
        window.editor.updateOptions({
            fontSize: parseInt(size),
            lineHeight: parseInt(size) * 1.5
        });
        // Force refresh
        window.editor.layout();
    }
}

// API functions
async function explainCode() {
    const code = window.editor.getValue();
    const language = document.getElementById('language-select').value;
    
    if (!code.trim()) {
        showOutput('Please enter some code to explain.', 'error');
        return;
    }
    
    try {
        showLoading('explain-btn', 'Generating explanation...');
        const response = await fetch(`${API_BASE_URL}/explain`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, language })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            document.getElementById('explanation-content').innerHTML = 
                formatExplanation(data.explanation || 'No explanation generated');
            document.querySelector('[data-tab="explanation"]').click();
        } else {
            showOutput(data.error || 'Failed to explain code', 'error');
        }
    } catch (error) {
        showOutput('Connection failed. Is backend running?', 'error');
    } finally {
        hideLoading('explain-btn', 'Explain Code');
    }
}

async function improveCode() {
    const code = window.editor.getValue();
    const language = document.getElementById('language-select').value;
    
    if (!code.trim()) {
        showOutput('Please enter some code to improve.', 'error');
        return;
    }
    
    try {
        showLoading('improve-btn', 'Analyzing code...');
        const response = await fetch(`${API_BASE_URL}/improve`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ code, language })
        });

        if (!response.ok) {
            throw new Error(await response.text() || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const improvedCodeDiv = document.getElementById('improved-code');
        
        if (data.improvedCode === "No correction required") {
            improvedCodeDiv.innerHTML = `<div class="no-correction">No correction required - code is already optimal!</div>`;
        } else {
            improvedCodeDiv.innerHTML = `<pre>${data.improvedCode}</pre>`;
        }
        document.querySelector('[data-tab="improved"]').click();

    } catch (error) {
        console.error('Improve Code Error:', error);
        showOutput(`Failed to improve code: ${error.message}`, 'error');
    } finally {
        hideLoading('improve-btn', 'Improve Code');
    }
}

async function executeCode() {
    const code = window.editor.getValue();
    const language = document.getElementById('language-select').value;
    
    if (!code.trim()) {
        showOutput('Please enter some code to execute.', 'error');
        return;
    }
    
    try {
        showLoading('run-btn', 'Executing...');
        const response = await fetch(`${API_BASE_URL}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, language })
        });
        
        const data = await response.json();
        document.getElementById('output-content').textContent = data.output || 'No output';
        document.querySelector('[data-tab="output"]').click();
    } catch (error) {
        showOutput('Connection failed. Is backend running?', 'error');
    } finally {
        hideLoading('run-btn', 'Run Code');
    }
}

// Helper functions
function formatExplanation(text) {
    return text
        .replace(/^# (.*)/gm, '<h3>$1</h3>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
}

function showOutput(message, type = 'normal') {
    const output = document.getElementById('output-content');
    output.textContent = message;
    output.className = type;
}

function showLoading(buttonId, text) {
    const btn = document.getElementById(buttonId);
    btn.disabled = true;
    btn.innerHTML = `<span class="loading"></span> ${text}`;
}

function hideLoading(buttonId, text) {
    const btn = document.getElementById(buttonId);
    btn.disabled = false;
    btn.innerHTML = text;
}

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    // UI elements
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('navLinks');
    
    // Mobile menu
    hamburger.addEventListener('click', () => navLinks.classList.toggle('active'));

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
        });
    });

    // Language selector
    document.getElementById('language-select').addEventListener('change', updateSampleCode);
    updateSampleCode();

    // Buttons
    document.getElementById('explain-btn').addEventListener('click', explainCode);
    document.getElementById('improve-btn').addEventListener('click', improveCode);
    document.getElementById('run-btn').addEventListener('click', executeCode);

    // Font size
    initializeFontSizeSelector();
});