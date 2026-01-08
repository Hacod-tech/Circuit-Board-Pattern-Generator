class CircuitPatternApp {
    constructor() {
        this.canvas = document.getElementById('drawingCanvas');
        this.backgroundRect = document.getElementById('backgroundRect');
        this.patternLayer = document.getElementById('patternLayer');
        this.objectsLayer = document.getElementById('objectsLayer');

        this.objects = [];
        this.currentObjectId = null;
        this.currentObject = null;
        this.isDrawing = false;
        this.isDragging = false;
        this.isResizing = false;
        this.isMoving = false;
        this.isDraggingGradient = false;
        this.dragStart = null;
        this.resizeStart = null;
        this.moveStart = null;
        this.patternGenerator = new PatternGenerator();
        this.currentPattern = null;
        this.nextObjectId = 1;
        this.editingTextObject = null;
        this.gradientStartPoint = null;
        this.gradientEndPoint = null;
        this.draggingGradientHandle = null; // 'start' or 'end'

        this.initializeEventListeners();
        this.updateBackground();
        this.updateObjectsList();

        // Initialize gradient color group visibility
        const gradientType = document.getElementById('lineGradientType').value;
        const gradientGroup = document.getElementById('gradientColorGroup');
        if (gradientType === 'none') {
            gradientGroup.style.display = 'none';
        } else {
            gradientGroup.style.display = 'flex';
        }
    }

    initializeEventListeners() {
        // Add object buttons
        document.querySelectorAll('.btn-add-object').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const type = e.target.getAttribute('data-type');
                this.addObject(type);
            });
        });

        // Canvas events for drawing/editing
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', () => this.handleMouseUp());
        this.canvas.addEventListener('mouseleave', () => this.handleMouseUp());
        this.canvas.addEventListener('dblclick', (e) => this.handleDoubleClick(e));

        // Touch events for mobile
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.canvas.dispatchEvent(mouseEvent);
        });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.canvas.dispatchEvent(mouseEvent);
        });

        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.handleMouseUp();
        });

        // Control events
        document.getElementById('lineColor').addEventListener('input', (e) => {
            if (this.currentPattern) {
                this.currentPattern.lineColor = e.target.value;
                this.renderPattern();
            }
        });

        document.getElementById('lineGradientType').addEventListener('change', (e) => {
            const gradientGroup = document.getElementById('gradientColorGroup');
            const gradientEditGroup = document.getElementById('gradientEditGroup');
            if (e.target.value === 'none') {
                gradientGroup.style.display = 'none';
                gradientEditGroup.style.display = 'none';
                this.gradientStartPoint = null;
                this.gradientEndPoint = null;
            } else {
                gradientGroup.style.display = 'flex';
                gradientEditGroup.style.display = 'flex';
                // Initialize gradient points if not set
                if (!this.gradientStartPoint || !this.gradientEndPoint) {
                    const canvasWidth = parseFloat(this.canvas.getAttribute('width'));
                    const canvasHeight = parseFloat(this.canvas.getAttribute('height'));
                    if (e.target.value === 'linear') {
                        // Default: bottom to top
                        this.gradientStartPoint = { x: canvasWidth / 2, y: canvasHeight };
                        this.gradientEndPoint = { x: canvasWidth / 2, y: 0 };
                    } else {
                        // Default: center
                        this.gradientStartPoint = { x: canvasWidth / 2, y: canvasHeight / 2 };
                        this.gradientEndPoint = { x: canvasWidth / 2, y: canvasHeight / 2 };
                    }
                }
            }
            if (this.currentPattern) {
                this.currentPattern.gradientType = e.target.value;
                this.currentPattern.gradientColor = document.getElementById('lineGradientColor').value;
                this.currentPattern.gradientStartPoint = this.gradientStartPoint;
                this.currentPattern.gradientEndPoint = this.gradientEndPoint;
                this.renderPattern();
            }
        });

        document.getElementById('editGradientPoints').addEventListener('change', (e) => {
            if (e.target.checked && this.currentPattern && this.currentPattern.gradientType !== 'none') {
                this.renderGradientHandles();
            } else {
                this.removeGradientHandles();
            }
        });

        document.getElementById('lineGradientColor').addEventListener('input', (e) => {
            if (this.currentPattern) {
                this.currentPattern.gradientColor = e.target.value;
                this.renderPattern();
                // Update gradient handles if visible
                if (document.getElementById('editGradientPoints').checked) {
                    this.renderGradientHandles();
                }
            }
        });

        document.getElementById('bgColor').addEventListener('input', () => this.updateBackground());
        document.getElementById('transparentBg').addEventListener('change', () => this.updateBackground());

        document.getElementById('patternDensity').addEventListener('input', (e) => {
            document.getElementById('densityValue').textContent = e.target.value;
        });

        document.getElementById('lineLengthMin').addEventListener('input', (e) => {
            document.getElementById('lengthMinValue').textContent = e.target.value;
        });

        document.getElementById('lineLengthMax').addEventListener('input', (e) => {
            document.getElementById('lengthMaxValue').textContent = e.target.value;
        });

        document.getElementById('patternScale').addEventListener('input', (e) => {
            document.getElementById('scaleValue').textContent = parseFloat(e.target.value).toFixed(1);
        });

        document.getElementById('lineThickness').addEventListener('input', (e) => {
            document.getElementById('thicknessValue').textContent = e.target.value;
            if (this.currentPattern) {
                this.currentPattern.lineThickness = parseInt(e.target.value);
                this.renderPattern();
            }
        });

        document.getElementById('circleRadius').addEventListener('input', (e) => {
            document.getElementById('radiusValue').textContent = e.target.value;
            if (this.currentPattern) {
                this.currentPattern.circleRadius = parseInt(e.target.value);
                this.renderPattern();
            }
        });

        // Buttons
        document.getElementById('generateBtn').addEventListener('click', () => this.generatePattern());
        document.getElementById('clearBtn').addEventListener('click', () => this.clear());
        document.getElementById('downloadBtn').addEventListener('click', () => this.downloadSVG());

        // Text editor modal
        const textModal = document.getElementById('textEditorModal');
        document.getElementById('textStrokeWidth').addEventListener('input', (e) => {
            document.getElementById('strokeWidthValue').textContent = parseFloat(e.target.value).toFixed(1);
        });

        document.getElementById('textLetterSpacing').addEventListener('input', (e) => {
            document.getElementById('letterSpacingValue').textContent = parseFloat(e.target.value).toFixed(1);
        });

        // Update text colors when line color changes
        document.getElementById('lineColor').addEventListener('input', () => {
            this.renderObjects();
            // Update gradient handles if visible
            if (document.getElementById('editGradientPoints').checked &&
                this.currentPattern && this.currentPattern.gradientType !== 'none') {
                this.renderGradientHandles();
            }
        });

        document.getElementById('textEditorSave').addEventListener('click', () => this.saveTextEdit());
        document.getElementById('textEditorCancel').addEventListener('click', () => this.closeTextEditor());
        document.querySelector('.modal-close').addEventListener('click', () => this.closeTextEditor());
        textModal.addEventListener('click', (e) => {
            if (e.target === textModal) {
                this.closeTextEditor();
            }
        });
    }

    addObject(type) {
        const id = this.nextObjectId++;
        const object = {
            id: id,
            type: type,
            data: this.getDefaultObjectData(type),
            svgElement: null
        };
        this.objects.push(object);
        this.currentObjectId = id;
        this.currentObject = object;
        this.updateObjectsList();
        this.renderObjects();

        // Start drawing/editing immediately for some types
        if (type === 'freehand') {
            this.isDrawing = true;
        }
    }

    getDefaultObjectData(type) {
        switch (type) {
            case 'freehand':
                return { points: [] };
            case 'text':
                return {
                    x: 400,
                    y: 300,
                    text: 'Text',
                    fontSize: 48,
                    fontFamily: 'Inter',
                    fontWeight: '400',
                    strokeWidth: 1,
                    letterSpacing: 0,
                    scaleX: 1,
                    scaleY: 1
                };
            case 'ellipse':
                return { cx: 400, cy: 300, rx: 100, ry: 80 };
            case 'rectangle':
                return { x: 300, y: 250, width: 200, height: 100 };
            default:
                return {};
        }
    }

    removeObject(id) {
        this.objects = this.objects.filter(obj => obj.id !== id);
        if (this.currentObjectId === id) {
            this.currentObjectId = this.objects.length > 0 ? this.objects[0].id : null;
            this.currentObject = this.objects.find(obj => obj.id === this.currentObjectId) || null;
        }
        this.updateObjectsList();
        this.renderObjects();
    }

    selectObject(id) {
        this.currentObjectId = id;
        this.currentObject = this.objects.find(obj => obj.id === id) || null;
        this.updateObjectsList();
    }

    updateObjectsList() {
        const list = document.getElementById('objectsList');
        list.innerHTML = '';

        this.objects.forEach(obj => {
            const item = document.createElement('div');
            item.className = `object-item ${obj.id === this.currentObjectId ? 'active' : ''}`;

            const info = document.createElement('div');
            info.className = 'object-info';

            const type = document.createElement('div');
            type.className = 'object-type';
            type.textContent = obj.type;

            const details = document.createElement('div');
            details.className = 'object-details';
            details.textContent = this.getObjectDetails(obj);

            info.appendChild(type);
            info.appendChild(details);

            const buttonGroup = document.createElement('div');
            buttonGroup.style.display = 'flex';
            buttonGroup.style.gap = '8px';

            // Add Edit button for text objects
            if (obj.type === 'text') {
                const editBtn = document.createElement('button');
                editBtn.className = 'btn-edit-object';
                editBtn.textContent = 'Edit';
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openTextEditor(obj);
                });
                buttonGroup.appendChild(editBtn);
            }

            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn-remove-object';
            removeBtn.textContent = 'Remove';
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeObject(obj.id);
            });
            buttonGroup.appendChild(removeBtn);

            item.appendChild(info);
            item.appendChild(buttonGroup);
            item.addEventListener('click', () => this.selectObject(obj.id));

            list.appendChild(item);
        });
    }

    getObjectDetails(obj) {
        switch (obj.type) {
            case 'freehand':
                return `${obj.data.points.length} points`;
            case 'text':
                return `"${obj.data.text}"`;
            case 'ellipse':
                return `${Math.round(obj.data.rx)}×${Math.round(obj.data.ry)}`;
            case 'rectangle':
                return `${Math.round(obj.data.width)}×${Math.round(obj.data.height)}`;
            default:
                return '';
        }
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    handleMouseDown(e) {
        const pos = this.getMousePos(e);

        // Check if clicking on gradient handle
        const target = e.target;
        if (target && target.classList && target.classList.contains('gradient-handle')) {
            this.isDraggingGradient = true;
            this.draggingGradientHandle = target.getAttribute('data-handle'); // 'start' or 'end'
            e.stopPropagation();
            e.preventDefault();
            return;
        }

        // Check if clicking on text resize handle
        if (this.currentObject && this.currentObject.type === 'text') {
            const target = e.target;
            // Check if target is a resize handle circle
            if (target && target.tagName === 'circle' && target.getAttribute('class') === 'text-resize-handle') {
                this.isResizing = true;
                const handleType = target.getAttribute('data-handle') || 'br';
                this.resizeStart = {
                    x: pos.x,
                    y: pos.y,
                    scaleX: this.currentObject.data.scaleX || 1,
                    scaleY: this.currentObject.data.scaleY || 1,
                    handleType: handleType
                };
                e.stopPropagation();
                e.preventDefault();
                return;
            }

            // Check if clicking on text itself (not a handle) - allow moving
            if (target && (target.tagName === 'text' || target.tagName === 'g')) {
                // Check if we're not clicking on a handle
                const isHandle = target.tagName === 'circle' && target.getAttribute('class') === 'text-resize-handle';
                if (!isHandle) {
                    this.isMoving = true;
                    this.moveStart = {
                        x: pos.x,
                        y: pos.y,
                        objX: this.currentObject.data.x,
                        objY: this.currentObject.data.y
                    };
                    e.stopPropagation();
                    return;
                }
            }
        }

        if (!this.currentObject) return;

        if (this.currentObject.type === 'freehand') {
            this.isDrawing = true;
            this.currentObject.data.points = [pos];
            this.renderObjects();
        } else if (this.currentObject.type === 'ellipse' || this.currentObject.type === 'rectangle') {
            this.isDragging = true;
            this.dragStart = pos;
            if (this.currentObject.type === 'ellipse') {
                this.currentObject.data.cx = pos.x;
                this.currentObject.data.cy = pos.y;
            } else {
                this.currentObject.data.x = pos.x;
                this.currentObject.data.y = pos.y;
            }
            this.renderObjects();
        }
    }

    handleMouseMove(e) {
        const pos = this.getMousePos(e);

        if (this.isDraggingGradient) {
            // Update gradient point position
            if (this.draggingGradientHandle === 'start') {
                this.gradientStartPoint = { x: pos.x, y: pos.y };
            } else if (this.draggingGradientHandle === 'end') {
                this.gradientEndPoint = { x: pos.x, y: pos.y };
            }

            // Update pattern and re-render
            if (this.currentPattern) {
                this.currentPattern.gradientStartPoint = this.gradientStartPoint;
                this.currentPattern.gradientEndPoint = this.gradientEndPoint;
                this.renderPattern();
                this.renderGradientHandles();
            }
            return;
        }

        if (this.isMoving && this.currentObject && this.currentObject.type === 'text') {
            // Move text by updating its position
            const dx = pos.x - this.moveStart.x;
            const dy = pos.y - this.moveStart.y;
            this.currentObject.data.x = this.moveStart.objX + dx;
            this.currentObject.data.y = this.moveStart.objY + dy;
            this.renderObjects();
            return;
        }

        if (this.isResizing && this.currentObject && this.currentObject.type === 'text') {
            // Resize text using scale parameters - linear scaling
            const dx = pos.x - this.resizeStart.x;
            const dy = pos.y - this.resizeStart.y;
            const handleType = this.resizeStart.handleType;

            // Use a constant sensitivity factor for linear scaling
            // 100 pixels of mouse movement = 1x scale change
            const sensitivity = 100;

            let newScaleX = this.resizeStart.scaleX;
            let newScaleY = this.resizeStart.scaleY;

            // Calculate scale based on handle type (linear, no limits)
            if (handleType === 'br') {
                // Bottom-right: scale both X and Y
                newScaleX = this.resizeStart.scaleX + dx / sensitivity;
                newScaleY = this.resizeStart.scaleY + dy / sensitivity;
            } else if (handleType === 'bl') {
                // Bottom-left: scale Y only
                newScaleY = this.resizeStart.scaleY + dy / sensitivity;
            } else if (handleType === 'tr') {
                // Top-right: scale X only
                newScaleX = this.resizeStart.scaleX + dx / sensitivity;
            }

            // Ensure scale doesn't go below a very small positive value to prevent issues
            newScaleX = Math.max(0.01, newScaleX);
            newScaleY = Math.max(0.01, newScaleY);

            this.currentObject.data.scaleX = newScaleX;
            this.currentObject.data.scaleY = newScaleY;
            this.renderObjects();
            return;
        }

        if (!this.currentObject) return;

        if (this.isDrawing && this.currentObject.type === 'freehand') {
            this.currentObject.data.points.push(pos);
            this.renderObjects();
        } else if (this.isDragging) {
            if (this.currentObject.type === 'ellipse') {
                const dx = pos.x - this.dragStart.x;
                const dy = pos.y - this.dragStart.y;
                this.currentObject.data.rx = Math.abs(dx);
                this.currentObject.data.ry = Math.abs(dy);
            } else if (this.currentObject.type === 'rectangle') {
                const dx = pos.x - this.dragStart.x;
                const dy = pos.y - this.dragStart.y;
                this.currentObject.data.width = Math.abs(dx);
                this.currentObject.data.height = Math.abs(dy);
            }
            this.renderObjects();
        }
    }

    handleMouseUp() {
        this.isDrawing = false;
        this.isDragging = false;
        this.isResizing = false;
        this.isMoving = false;
        this.isDraggingGradient = false;
        this.dragStart = null;
        this.resizeStart = null;
        this.moveStart = null;
        this.draggingGradientHandle = null;

        if (this.currentObject && this.currentObject.type === 'freehand' && this.currentObject.data.points.length > 0) {
            // Close the path if it has enough points
            if (this.currentObject.data.points.length >= 3) {
                // Path is already closed in rendering
            }
        }
        this.updateObjectsList();
    }

    handleDoubleClick(e) {
        if (this.currentObject && this.currentObject.type === 'text') {
            this.openTextEditor(this.currentObject);
        }
    }

    openTextEditor(obj) {
        this.editingTextObject = obj;
        document.getElementById('textContent').value = obj.data.text;
        document.getElementById('textFontFamily').value = obj.data.fontFamily || 'Inter';
        document.getElementById('textFontWeight').value = obj.data.fontWeight || '400';
        document.getElementById('textStrokeWidth').value = obj.data.strokeWidth || 1;
        document.getElementById('strokeWidthValue').textContent = obj.data.strokeWidth || 1;
        document.getElementById('textLetterSpacing').value = obj.data.letterSpacing || 0;
        document.getElementById('letterSpacingValue').textContent = obj.data.letterSpacing || 0;
        document.getElementById('textEditorModal').classList.add('show');
    }

    closeTextEditor() {
        document.getElementById('textEditorModal').classList.remove('show');
        this.editingTextObject = null;
    }

    saveTextEdit() {
        if (!this.editingTextObject) return;

        this.editingTextObject.data.text = document.getElementById('textContent').value;
        this.editingTextObject.data.fontFamily = document.getElementById('textFontFamily').value;
        this.editingTextObject.data.fontWeight = document.getElementById('textFontWeight').value;
        this.editingTextObject.data.strokeWidth = parseFloat(document.getElementById('textStrokeWidth').value);
        this.editingTextObject.data.letterSpacing = parseFloat(document.getElementById('textLetterSpacing').value);

        this.renderObjects();
        this.updateObjectsList();
        this.closeTextEditor();
    }

    renderObjects() {
        // Clear objects layer
        while (this.objectsLayer.firstChild) {
            this.objectsLayer.removeChild(this.objectsLayer.firstChild);
        }

        // Render all objects
        this.objects.forEach(obj => {
            const element = this.createObjectElement(obj);
            if (element) {
                if (obj.id === this.currentObjectId) {
                    element.setAttribute('stroke', '#00ff00');
                    element.setAttribute('stroke-width', '2');
                } else {
                    element.setAttribute('stroke', '#ffffff');
                    element.setAttribute('stroke-width', '2');
                    element.setAttribute('stroke-opacity', '0.5');
                }
                this.objectsLayer.appendChild(element);
                obj.svgElement = element;
            }
        });
    }

    createObjectElement(obj) {
        switch (obj.type) {
            case 'freehand':
                if (obj.data.points.length < 2) return null;
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                let pathData = `M ${obj.data.points[0].x} ${obj.data.points[0].y}`;
                for (let i = 1; i < obj.data.points.length; i++) {
                    pathData += ` L ${obj.data.points[i].x} ${obj.data.points[i].y}`;
                }
                if (obj.data.points.length >= 3) {
                    pathData += ' Z';
                }
                path.setAttribute('d', pathData);
                path.setAttribute('fill', 'none');
                return path;

            case 'text':
                const containerGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');

                const textGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');

                // Apply scale transform
                const scaleX = obj.data.scaleX || 1;
                const scaleY = obj.data.scaleY || 1;
                textGroup.setAttribute('transform', `translate(${obj.data.x}, ${obj.data.y}) scale(${scaleX}, ${scaleY}) translate(${-obj.data.x}, ${-obj.data.y})`);

                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', obj.data.x);
                text.setAttribute('y', obj.data.y);
                text.setAttribute('font-size', obj.data.fontSize);
                text.setAttribute('font-family', obj.data.fontFamily || 'Inter');
                text.setAttribute('font-weight', obj.data.fontWeight || '400');
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('dominant-baseline', 'middle');

                // Apply letter spacing
                const letterSpacing = obj.data.letterSpacing || 0;
                if (letterSpacing !== 0) {
                    text.setAttribute('letter-spacing', letterSpacing);
                }

                // Use line color with 30% opacity for text display
                const lineColor = document.getElementById('lineColor').value;
                const rgb = this.hexToRgb(lineColor);
                const fillColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`;
                text.setAttribute('fill', fillColor);

                const strokeWidth = obj.data.strokeWidth || 1;
                if (strokeWidth > 0) {
                    text.setAttribute('stroke', fillColor);
                    text.setAttribute('stroke-width', strokeWidth);
                }
                text.textContent = obj.data.text;
                // Make text cursor indicate it's draggable when selected
                if (obj.id === this.currentObjectId) {
                    text.setAttribute('style', 'cursor: move;');
                }
                textGroup.appendChild(text);
                containerGroup.appendChild(textGroup);

                // Add resize handles at corners (only for active object)
                // Handles are in a separate group so they're not affected by the text transform
                if (obj.id === this.currentObjectId) {
                    const handleGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');

                    // Get actual text bounds
                    // Create temporary text element to measure (without transform)
                    const tempText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    tempText.setAttribute('x', obj.data.x);
                    tempText.setAttribute('y', obj.data.y);
                    tempText.setAttribute('font-size', obj.data.fontSize);
                    tempText.setAttribute('font-family', obj.data.fontFamily || 'Arial');
                    tempText.setAttribute('font-weight', obj.data.fontWeight || '400');
                    tempText.setAttribute('text-anchor', 'middle');
                    tempText.setAttribute('dominant-baseline', 'middle');
                    tempText.setAttribute('fill', 'black');
                    tempText.textContent = obj.data.text;
                    this.canvas.appendChild(tempText);

                    let bbox;
                    try {
                        const textBBox = tempText.getBBox();
                        // Apply scale transform to bounds
                        // The transform is: translate(x,y) scale(sx,sy) translate(-x,-y)
                        // This scales around the center point
                        const centerX = obj.data.x;
                        const centerY = obj.data.y;
                        bbox = {
                            x: centerX + (textBBox.x - centerX) * scaleX,
                            y: centerY + (textBBox.y - centerY) * scaleY,
                            width: textBBox.width * scaleX,
                            height: textBBox.height * scaleY
                        };
                    } catch (e) {
                        // Fallback to approximate bounds
                        const baseBbox = this.getTextBBox(obj);
                        bbox = {
                            x: obj.data.x - (baseBbox.width * scaleX) / 2,
                            y: obj.data.y - (baseBbox.height * scaleY) / 2,
                            width: baseBbox.width * scaleX,
                            height: baseBbox.height * scaleY
                        };
                    }

                    // Remove temp text
                    this.canvas.removeChild(tempText);

                    // Get canvas bounds
                    const canvasWidth = parseFloat(this.canvas.getAttribute('width'));
                    const canvasHeight = parseFloat(this.canvas.getAttribute('height'));
                    const handleSize = 8;
                    const handleRadius = handleSize / 2;
                    const padding = handleRadius + 2; // Small padding from canvas edge
                    const offset = 5; // Offset from text bounds to keep handles visible

                    // Calculate handle positions with offset from text bounds
                    let brX = bbox.x + bbox.width + offset;
                    let brY = bbox.y + bbox.height + offset;
                    let blX = bbox.x - offset;
                    let blY = bbox.y + bbox.height + offset;
                    let trX = bbox.x + bbox.width + offset;
                    let trY = bbox.y - offset;

                    // Clamp to canvas bounds, but prefer keeping handles close to text
                    const clampX = (x, preferredX) => {
                        if (x >= padding && x <= canvasWidth - padding) return x;
                        // If outside bounds, clamp but try to stay as close as possible
                        return Math.max(padding, Math.min(canvasWidth - padding, preferredX));
                    };
                    const clampY = (y, preferredY) => {
                        if (y >= padding && y <= canvasHeight - padding) return y;
                        return Math.max(padding, Math.min(canvasHeight - padding, preferredY));
                    };

                    // Bottom-right handle (scale both X and Y)
                    const handleBR = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    handleBR.setAttribute('cx', clampX(brX, bbox.x + bbox.width));
                    handleBR.setAttribute('cy', clampY(brY, bbox.y + bbox.height));
                    handleBR.setAttribute('r', handleRadius);
                    handleBR.setAttribute('class', 'text-resize-handle');
                    handleBR.setAttribute('data-handle', 'br');
                    handleGroup.appendChild(handleBR);

                    // Bottom-left handle (scale Y)
                    const handleBL = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    handleBL.setAttribute('cx', clampX(blX, bbox.x));
                    handleBL.setAttribute('cy', clampY(blY, bbox.y + bbox.height));
                    handleBL.setAttribute('r', handleRadius);
                    handleBL.setAttribute('class', 'text-resize-handle');
                    handleBL.setAttribute('data-handle', 'bl');
                    handleGroup.appendChild(handleBL);

                    // Top-right handle (scale X)
                    const handleTR = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    handleTR.setAttribute('cx', clampX(trX, bbox.x + bbox.width));
                    handleTR.setAttribute('cy', clampY(trY, bbox.y));
                    handleTR.setAttribute('r', handleRadius);
                    handleTR.setAttribute('class', 'text-resize-handle');
                    handleTR.setAttribute('data-handle', 'tr');
                    handleGroup.appendChild(handleTR);

                    containerGroup.appendChild(handleGroup);
                }

                return containerGroup;

            case 'ellipse':
                const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
                ellipse.setAttribute('cx', obj.data.cx);
                ellipse.setAttribute('cy', obj.data.cy);
                ellipse.setAttribute('rx', Math.max(1, obj.data.rx));
                ellipse.setAttribute('ry', Math.max(1, obj.data.ry));
                ellipse.setAttribute('fill', 'none');
                return ellipse;

            case 'rectangle':
                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rect.setAttribute('x', obj.data.x);
                rect.setAttribute('y', obj.data.y);
                rect.setAttribute('width', Math.max(1, obj.data.width));
                rect.setAttribute('height', Math.max(1, obj.data.height));
                rect.setAttribute('fill', 'none');
                return rect;

            default:
                return null;
        }
    }

    updateBackground() {
        const bgColor = document.getElementById('bgColor').value;
        const transparent = document.getElementById('transparentBg').checked;

        if (transparent) {
            this.backgroundRect.setAttribute('fill', 'none');
        } else {
            this.backgroundRect.setAttribute('fill', bgColor);
        }
    }

    generatePattern() {
        if (this.objects.length === 0) {
            alert('Please add at least one object first!');
            return;
        }

        const gradientType = document.getElementById('lineGradientType').value;

        // Initialize gradient points if needed
        if (gradientType !== 'none' && (!this.gradientStartPoint || !this.gradientEndPoint)) {
            const canvasWidth = parseFloat(this.canvas.getAttribute('width'));
            const canvasHeight = parseFloat(this.canvas.getAttribute('height'));
            if (gradientType === 'linear') {
                this.gradientStartPoint = { x: canvasWidth / 2, y: canvasHeight };
                this.gradientEndPoint = { x: canvasWidth / 2, y: 0 };
            } else {
                this.gradientStartPoint = { x: canvasWidth / 2, y: canvasHeight / 2 };
                this.gradientEndPoint = { x: canvasWidth / 2, y: canvasHeight / 2 };
            }
        }

        const options = {
            density: parseInt(document.getElementById('patternDensity').value),
            lineLengthMin: parseInt(document.getElementById('lineLengthMin').value),
            lineLengthMax: parseInt(document.getElementById('lineLengthMax').value),
            lineThickness: parseInt(document.getElementById('lineThickness').value),
            circleRadius: parseInt(document.getElementById('circleRadius').value),
            style: document.getElementById('patternStyle').value,
            lineColor: document.getElementById('lineColor').value,
            gradientType: gradientType,
            gradientColor: document.getElementById('lineGradientColor').value,
            gradientStartPoint: this.gradientStartPoint,
            gradientEndPoint: this.gradientEndPoint,
            patternScale: parseFloat(document.getElementById('patternScale').value)
        };

        // Create a rasterized mask of all objects
        const maskCanvas = this.createRasterizedMask();

        if (!maskCanvas) {
            alert('No valid shapes to generate pattern for!');
            return;
        }

        // Generate pattern using the mask
        const pattern = this.patternGenerator.generateWithMask(maskCanvas, options);
        this.currentPattern = pattern;

        // Store gradient points in pattern
        if (this.gradientStartPoint && this.gradientEndPoint) {
            this.currentPattern.gradientStartPoint = this.gradientStartPoint;
            this.currentPattern.gradientEndPoint = this.gradientEndPoint;
        }

        // Render pattern
        this.renderPattern();
    }

    getShapeDataForPattern(obj) {
        switch (obj.type) {
            case 'freehand':
                if (obj.data.points.length < 3) return null;
                return obj.data.points;
            case 'text':
                // For pattern generation, use a tighter bounding box that better approximates text
                // The canvas method handles actual letter detection
                return this.getTextPathPoints(obj);
            case 'ellipse':
                // Convert ellipse to polygon points
                const ellipsePoints = [];
                const steps = 32;
                for (let i = 0; i < steps; i++) {
                    const angle = (i / steps) * 2 * Math.PI;
                    ellipsePoints.push({
                        x: obj.data.cx + obj.data.rx * Math.cos(angle),
                        y: obj.data.cy + obj.data.ry * Math.sin(angle)
                    });
                }
                return ellipsePoints;
            case 'rectangle':
                return [
                    { x: obj.data.x, y: obj.data.y },
                    { x: obj.data.x + obj.data.width, y: obj.data.y },
                    { x: obj.data.x + obj.data.width, y: obj.data.y + obj.data.height },
                    { x: obj.data.x, y: obj.data.y + obj.data.height }
                ];
            default:
                return null;
        }
    }

    hexToRgb(hex) {
        // Remove # if present
        hex = hex.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return { r, g, b };
    }

    getTextBBox(obj) {
        // Approximate text bounding box
        const fontSize = obj.data.fontSize;
        const textLength = obj.data.text.length;
        const fontWeight = parseInt(obj.data.fontWeight || '400');
        const weightMultiplier = 1 + (fontWeight - 400) / 1000; // Slight width increase for bold
        const width = textLength * fontSize * 0.6 * weightMultiplier;
        const height = fontSize * 1.2;
        const scaleX = obj.data.scaleX || 1;
        const scaleY = obj.data.scaleY || 1;
        return {
            x: obj.data.x - (width * scaleX) / 2,
            y: obj.data.y - (height * scaleY) / 2,
            width: width * scaleX,
            height: height * scaleY
        };
    }

    createRasterizedMask() {
        // Create a canvas to rasterize all objects as a mask
        const canvasWidth = parseFloat(this.canvas.getAttribute('width'));
        const canvasHeight = parseFloat(this.canvas.getAttribute('height'));

        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = canvasWidth;
        maskCanvas.height = canvasHeight;
        const ctx = maskCanvas.getContext('2d', { willReadFrequently: true });

        // Fill with white (objects will be black)
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Set to black for drawing objects
        ctx.fillStyle = 'black';
        ctx.strokeStyle = 'black';

        let hasObjects = false;

        // Rasterize each object
        this.objects.forEach(obj => {
            switch (obj.type) {
                case 'freehand':
                    if (obj.data.points.length < 3) return;
                    ctx.beginPath();
                    ctx.moveTo(obj.data.points[0].x, obj.data.points[0].y);
                    for (let i = 1; i < obj.data.points.length; i++) {
                        ctx.lineTo(obj.data.points[i].x, obj.data.points[i].y);
                    }
                    ctx.closePath();
                    ctx.fill();
                    hasObjects = true;
                    break;

                case 'text':
                    // Render text with full fill and stroke
                    const scaleX = obj.data.scaleX || 1;
                    const scaleY = obj.data.scaleY || 1;
                    const fontWeight = obj.data.fontWeight || '400';
                    const fontSize = obj.data.fontSize;
                    const fontFamily = obj.data.fontFamily || 'Inter';
                    const strokeWidth = obj.data.strokeWidth || 0;
                    const letterSpacing = obj.data.letterSpacing || 0;

                    let cssWeight = fontWeight;
                    if (typeof fontWeight === 'number' || !isNaN(parseInt(fontWeight))) {
                        cssWeight = parseInt(fontWeight);
                    }

                    ctx.font = `${cssWeight} ${fontSize}px ${fontFamily}`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.letterSpacing = `${letterSpacing}px`;

                    // Apply transform: translate(x,y) scale(sx,sy) translate(-x,-y)
                    ctx.save();
                    ctx.translate(obj.data.x, obj.data.y);
                    ctx.scale(scaleX, scaleY);
                    ctx.translate(-obj.data.x, -obj.data.y);

                    // Draw stroke first (if any), then fill
                    if (strokeWidth > 0) {
                        ctx.lineWidth = strokeWidth;
                        ctx.strokeText(obj.data.text, obj.data.x, obj.data.y);
                    }
                    ctx.fillText(obj.data.text, obj.data.x, obj.data.y);
                    ctx.restore();
                    hasObjects = true;
                    break;

                case 'ellipse':
                    ctx.beginPath();
                    ctx.ellipse(obj.data.cx, obj.data.cy, Math.max(1, obj.data.rx), Math.max(1, obj.data.ry), 0, 0, 2 * Math.PI);
                    ctx.fill();
                    hasObjects = true;
                    break;

                case 'rectangle':
                    ctx.fillRect(obj.data.x, obj.data.y, Math.max(1, obj.data.width), Math.max(1, obj.data.height));
                    hasObjects = true;
                    break;
            }
        });

        if (!hasObjects) {
            return null;
        }

        return maskCanvas;
    }

    createTextElementForPattern(obj) {
        // Create SVG text element with proper transform for pattern generation
        const textGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        const scaleX = obj.data.scaleX || 1;
        const scaleY = obj.data.scaleY || 1;
        textGroup.setAttribute('transform', `translate(${obj.data.x}, ${obj.data.y}) scale(${scaleX}, ${scaleY}) translate(${-obj.data.x}, ${-obj.data.y})`);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', obj.data.x);
        text.setAttribute('y', obj.data.y);
        text.setAttribute('font-size', obj.data.fontSize);
        text.setAttribute('font-family', obj.data.fontFamily || 'Arial');
        text.setAttribute('font-weight', obj.data.fontWeight || '400');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('fill', 'black'); // Need fill for isPointInFill to work
        text.textContent = obj.data.text;
        textGroup.appendChild(text);

        // Add to canvas temporarily (will be removed after pattern generation)
        this.canvas.appendChild(textGroup);

        // Create a canvas-based mask for accurate point detection
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const canvasWidth = parseFloat(this.canvas.getAttribute('width'));
        const canvasHeight = parseFloat(this.canvas.getAttribute('height'));
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        // Clear canvas with transparent background
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        // Render text to canvas for pixel-based detection
        // Canvas coordinates match SVG coordinates (1:1)
        ctx.fillStyle = 'black';
        // Build font string properly - handle numeric vs string font weight
        const fontWeight = obj.data.fontWeight || '400';
        const fontSize = obj.data.fontSize;
        const fontFamily = obj.data.fontFamily || 'Arial';

        // Convert numeric font weight to CSS weight
        let cssWeight = fontWeight;
        if (typeof fontWeight === 'number' || !isNaN(parseInt(fontWeight))) {
            cssWeight = parseInt(fontWeight);
        }

        ctx.font = `${cssWeight} ${fontSize}px ${fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Apply the same transform as SVG: translate(x,y) scale(sx,sy) translate(-x,-y)
        // This scales around the center point
        ctx.save();
        ctx.translate(obj.data.x, obj.data.y);
        ctx.scale(scaleX, scaleY);
        ctx.translate(-obj.data.x, -obj.data.y);
        // Fill text at the center point
        ctx.fillText(obj.data.text, obj.data.x, obj.data.y);
        ctx.restore();

        // Return both the text element and the group for proper transform handling
        return {
            text: text,
            group: textGroup,
            scaleX: scaleX,
            scaleY: scaleY,
            centerX: obj.data.x,
            centerY: obj.data.y,
            canvas: canvas,
            ctx: ctx
        };
    }

    getTextPathPoints(obj) {
        // Create a temporary text element to get accurate bounds
        const tempText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        tempText.setAttribute('x', obj.data.x);
        tempText.setAttribute('y', obj.data.y);
        tempText.setAttribute('font-size', obj.data.fontSize);
        tempText.setAttribute('font-family', obj.data.fontFamily || 'Arial');
        tempText.setAttribute('font-weight', obj.data.fontWeight || '400');
        tempText.setAttribute('text-anchor', 'middle');
        tempText.setAttribute('dominant-baseline', 'middle');
        tempText.setAttribute('fill', 'black');
        tempText.textContent = obj.data.text;

        // Add to canvas temporarily to measure
        this.canvas.appendChild(tempText);

        let bbox;
        try {
            bbox = tempText.getBBox();
        } catch (e) {
            // Fallback to approximate if getBBox fails
            bbox = this.getTextBBox(obj);
        }

        // Remove temp element
        this.canvas.removeChild(tempText);

        // Apply scale
        const scaleX = obj.data.scaleX || 1;
        const scaleY = obj.data.scaleY || 1;

        // Create a tighter bounding box (reduce padding to better fit text)
        // Text doesn't fill the entire bbox, so reduce it
        const paddingX = bbox.width * 0.1; // 10% padding reduction
        const paddingY = bbox.height * 0.15; // 15% padding reduction (more vertical)

        const tightBbox = {
            x: bbox.x + paddingX,
            y: bbox.y + paddingY,
            width: bbox.width - paddingX * 2,
            height: bbox.height - paddingY * 2
        };

        // Apply scale to the tighter bounds
        const centerX = obj.data.x;
        const centerY = obj.data.y;
        const scaledBbox = {
            x: centerX + (tightBbox.x - centerX) * scaleX,
            y: centerY + (tightBbox.y - centerY) * scaleY,
            width: tightBbox.width * scaleX,
            height: tightBbox.height * scaleY
        };

        // Return bounding box points (for bounds calculation only - actual detection uses canvas)
        return [
            { x: scaledBbox.x, y: scaledBbox.y },
            { x: scaledBbox.x + scaledBbox.width, y: scaledBbox.y },
            { x: scaledBbox.x + scaledBbox.width, y: scaledBbox.y + scaledBbox.height },
            { x: scaledBbox.x, y: scaledBbox.y + scaledBbox.height }
        ];
    }

    renderPattern() {
        if (!this.currentPattern) return;

        // Restore gradient points from pattern if available
        if (this.currentPattern.gradientStartPoint && this.currentPattern.gradientEndPoint) {
            this.gradientStartPoint = this.currentPattern.gradientStartPoint;
            this.gradientEndPoint = this.currentPattern.gradientEndPoint;
        }

        this.patternGenerator.renderToSVG(this.currentPattern, this.canvas);

        // Show gradient handles if editing is enabled
        if (document.getElementById('editGradientPoints').checked &&
            this.currentPattern.gradientType !== 'none') {
            this.renderGradientHandles();
        }
    }

    renderGradientHandles() {
        // Remove existing handles
        this.removeGradientHandles();

        if (!this.currentPattern || this.currentPattern.gradientType === 'none') return;
        if (!this.gradientStartPoint || !this.gradientEndPoint) return;

        const handleGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        handleGroup.setAttribute('id', 'gradientHandles');

        // Get line color for start handle
        const lineColor = document.getElementById('lineColor').value;

        // Start point handle
        const startHandle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        startHandle.setAttribute('cx', this.gradientStartPoint.x);
        startHandle.setAttribute('cy', this.gradientStartPoint.y);
        startHandle.setAttribute('r', 8);
        startHandle.setAttribute('fill', lineColor);
        startHandle.setAttribute('stroke', 'white');
        startHandle.setAttribute('stroke-width', '2');
        startHandle.setAttribute('class', 'gradient-handle');
        startHandle.setAttribute('data-handle', 'start');
        startHandle.setAttribute('style', 'cursor: move;');
        handleGroup.appendChild(startHandle);

        // End point handle
        const endHandle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        endHandle.setAttribute('cx', this.gradientEndPoint.x);
        endHandle.setAttribute('cy', this.gradientEndPoint.y);
        endHandle.setAttribute('r', 8);
        endHandle.setAttribute('fill', document.getElementById('lineGradientColor').value);
        endHandle.setAttribute('stroke', 'white');
        endHandle.setAttribute('stroke-width', '2');
        endHandle.setAttribute('class', 'gradient-handle');
        endHandle.setAttribute('data-handle', 'end');
        endHandle.setAttribute('style', 'cursor: move;');
        handleGroup.appendChild(endHandle);

        // Draw line connecting the points (for visual reference)
        if (this.currentPattern.gradientType === 'linear') {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', this.gradientStartPoint.x);
            line.setAttribute('y1', this.gradientStartPoint.y);
            line.setAttribute('x2', this.gradientEndPoint.x);
            line.setAttribute('y2', this.gradientEndPoint.y);
            line.setAttribute('stroke', '#ff601f');
            line.setAttribute('stroke-width', '1');
            line.setAttribute('stroke-dasharray', '5,5');
            line.setAttribute('opacity', '0.5');
            handleGroup.appendChild(line);
        }

        this.canvas.appendChild(handleGroup);
    }

    removeGradientHandles() {
        const handles = this.canvas.querySelector('#gradientHandles');
        if (handles) {
            this.canvas.removeChild(handles);
        }
    }

    clear() {
        this.objects = [];
        this.currentObjectId = null;
        this.currentObject = null;
        this.isDrawing = false;
        this.isDragging = false;
        this.currentPattern = null;
        this.updateObjectsList();
        this.renderObjects();

        // Clear pattern layer
        while (this.patternLayer.firstChild) {
            this.patternLayer.removeChild(this.patternLayer.firstChild);
        }
    }

    downloadSVG() {
        if (!this.currentPattern) {
            alert('Please generate a pattern first!');
            return;
        }

        // Create a new SVG with the pattern
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svg.setAttribute('width', this.canvas.getAttribute('width'));
        svg.setAttribute('height', this.canvas.getAttribute('height'));

        // Create defs section for gradients
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        svg.appendChild(defs);

        // Copy gradient definitions from the original canvas if they exist
        const originalDefs = this.canvas.querySelector('defs');
        if (originalDefs) {
            const gradients = originalDefs.querySelectorAll('linearGradient, radialGradient');
            gradients.forEach(gradient => {
                defs.appendChild(gradient.cloneNode(true));
            });
        }

        // Add background if not transparent
        const transparent = document.getElementById('transparentBg').checked;
        if (!transparent) {
            const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            bg.setAttribute('width', '100%');
            bg.setAttribute('height', '100%');
            bg.setAttribute('fill', document.getElementById('bgColor').value);
            svg.appendChild(bg);
        }

        // Add pattern (no clipping)
        const patternGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');

        // Clone pattern elements
        const patternElements = this.patternLayer.querySelectorAll('*');
        patternElements.forEach(el => {
            patternGroup.appendChild(el.cloneNode(true));
        });

        svg.appendChild(patternGroup);

        // Convert to string and download
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(svg);
        const blob = new Blob([svgString], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = 'circuit-pattern.svg';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new CircuitPatternApp();
});
