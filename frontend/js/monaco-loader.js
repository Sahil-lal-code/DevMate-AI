require(['vs/editor/editor.main'], function() {
    // Get saved font size or default to 14px
    const savedFontSize = localStorage.getItem('editorFontSize') || '14';
    
    // Initialize editor with touch support
    window.editor = monaco.editor.create(document.getElementById('monaco-editor'), {
        value: SAMPLE_CODES['python'],
        language: 'python',
        theme: 'vs-dark',
        automaticLayout: true,
        scrollBeyondLastLine: false,
        mouseWheelZoom: true,
        scrollbar: {
            alwaysConsumeMouseWheel: false,
            vertical: 'visible',
            horizontal: 'visible',
            useShadows: true,
            verticalHasArrows: false,
            horizontalHasArrows: false,
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
            arrowSize: 14
        },
        minimap: {
            enabled: false
        },
        fontSize: parseInt(savedFontSize),
        lineHeight: parseInt(savedFontSize) * 1.5,
        lineNumbers: 'on',
        renderLineHighlight: 'gutter'
    });

    // Add touch event listeners
    const editorContainer = document.getElementById('monaco-editor');
    let touchYStart = 0;

    function handleTouchStart(e) {
        touchYStart = e.touches[0].clientY;
    }

    function handleTouchMove(e) {
        const touchY = e.touches[0].clientY;
        const deltaY = touchYStart - touchY;
        
        if (Math.abs(deltaY) > 5) {
            const scrollTop = window.editor.getScrollTop();
            const scrollHeight = window.editor.getScrollHeight();
            const editorHeight = window.editor.getLayoutInfo().height;
            
            if ((deltaY < 0 && scrollTop > 0) || 
                (deltaY > 0 && scrollTop < scrollHeight - editorHeight)) {
                e.preventDefault();
                window.editor.setScrollTop(scrollTop + deltaY);
            }
        }
        touchYStart = touchY;
    }

    editorContainer.addEventListener('touchstart', handleTouchStart, { passive: false });
    editorContainer.addEventListener('touchmove', handleTouchMove, { passive: false });
});