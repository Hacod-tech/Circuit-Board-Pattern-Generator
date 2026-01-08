class PatternGenerator {
    constructor() {
        this.segments = [];
        this.usedSpace = [];
        this.canvas = null; // Will be set when needed for text detection
    }

    /**
     * Generate pattern using a rasterized mask canvas
     * @param {HTMLCanvasElement} maskCanvas - Canvas with black shapes on white background
     * @param {Object} options - Configuration options
     * @returns {Object} - Pattern data with paths and circles
     */
    generateWithMask(maskCanvas, options = {}) {
        const {
            density = 20,
            lineLengthMin = 20,
            lineLengthMax = 150,
            lineThickness = 2,
            circleRadius = 4,
            style = 'organic',
            lineColor = '#00ff00',
            patternScale = 1
        } = options;

        this.segments = [];
        this.usedSpace = [];

        const ctx = maskCanvas.getContext('2d');
        const canvasWidth = maskCanvas.width;
        const canvasHeight = maskCanvas.height;

        // Scale the bounds for pattern generation
        const scaledWidth = canvasWidth / patternScale;
        const scaledHeight = canvasHeight / patternScale;

        // Scale all dimensions: thickness, radius, and line lengths
        const scaledLineThickness = lineThickness * patternScale;
        const scaledCircleRadius = circleRadius * patternScale;
        const scaledLineLengthMin = lineLengthMin * patternScale;
        const scaledLineLengthMax = lineLengthMax * patternScale;
        // Density scales inversely to maintain same number of lines per unit area
        const scaledDensity = density / patternScale;

        const bounds = {
            x: 0,
            y: 0,
            width: scaledWidth,
            height: scaledHeight
        };

        // Generate segments with variable length (between min and max)
        // Use average length for generation, but allow variation
        const avgLength = (scaledLineLengthMin + scaledLineLengthMax) / 2;
        const gridSize = scaledDensity;
        const minSpacing = Math.max(gridSize * 0.3, scaledLineThickness + scaledCircleRadius);

        // Create potential segments with variable lengths
        const potentialSegments = this.createPotentialSegments(bounds, gridSize, style, avgLength, scaledLineLengthMin, scaledLineLengthMax);

        // Filter segments to only those inside the mask (simplified check)
        const validSegments = potentialSegments.filter(segment => {
            // Scale segment coordinates to original canvas space for mask checking
            const scaledStart = {
                x: segment.start.x * patternScale,
                y: segment.start.y * patternScale
            };
            const scaledEnd = {
                x: segment.end.x * patternScale,
                y: segment.end.y * patternScale
            };

            // Check endpoints only (faster)
            const startInside = this.isPointInMask(scaledStart, maskCanvas, ctx);
            const endInside = this.isPointInMask(scaledEnd, maskCanvas, ctx);

            if (!startInside || !endInside) {
                return false;
            }

            // For curved segments, check midpoint
            if (segment.points && segment.points.length > 2) {
                const midPoint = segment.points[Math.floor(segment.points.length / 2)];
                const scaledMid = {
                    x: midPoint.x * patternScale,
                    y: midPoint.y * patternScale
                };
                return this.isPointInMask(scaledMid, maskCanvas, ctx);
            }

            // For straight segments, check midpoint only
            const midPoint = {
                x: (scaledStart.x + scaledEnd.x) / 2,
                y: (scaledStart.y + scaledEnd.y) / 2
            };
            return this.isPointInMask(midPoint, maskCanvas, ctx);
        });

        // Sort by length (longer first) - this ensures longest lines are placed first
        validSegments.sort((a, b) => b.length - a.length);

        // Place segments starting from longest
        const placedSegments = [];
        for (const segment of validSegments) {
            // Only place if length is within range
            if (segment.length >= scaledLineLengthMin && segment.length <= scaledLineLengthMax) {
                if (this.canPlaceSegment(segment, placedSegments, minSpacing, scaledLineThickness, scaledCircleRadius)) {
                    placedSegments.push(segment);
                }
            }
        }

        // Find intersections and create forks
        const forks = this.findIntersections(placedSegments);

        // Extract endpoints for circles (before shortening)
        const endpoints = this.getEndpoints(placedSegments, forks);

        // Shorten segments to leave space for circles at endpoints (unless at forks)
        const shortenedSegments = this.shortenSegmentsForCircles(placedSegments, forks, scaledCircleRadius);

        // Scale all coordinates back to original canvas space
        const scaledSegments = shortenedSegments.map(segment => {
            if (segment.points && segment.points.length > 2) {
                // Curved segment
                return {
                    ...segment,
                    start: {
                        x: segment.start.x * patternScale,
                        y: segment.start.y * patternScale
                    },
                    end: {
                        x: segment.end.x * patternScale,
                        y: segment.end.y * patternScale
                    },
                    points: segment.points.map(p => ({
                        x: p.x * patternScale,
                        y: p.y * patternScale
                    }))
                };
            } else {
                // Straight segment
                return {
                    ...segment,
                    start: {
                        x: segment.start.x * patternScale,
                        y: segment.start.y * patternScale
                    },
                    end: {
                        x: segment.end.x * patternScale,
                        y: segment.end.y * patternScale
                    }
                };
            }
        });

        const scaledCircles = endpoints.map(circle => ({
            ...circle,
            x: circle.x * patternScale,
            y: circle.y * patternScale
        }));

        const scaledForks = forks.map(fork => ({
            ...fork,
            x: fork.x * patternScale,
            y: fork.y * patternScale
        }));

        return {
            segments: scaledSegments,
            circles: scaledCircles,
            forks: scaledForks,
            lineThickness: scaledLineThickness,
            circleRadius: scaledCircleRadius,
            lineColor,
            gradientType: options.gradientType || 'none',
            gradientColor: options.gradientColor || lineColor,
            gradientStartPoint: options.gradientStartPoint,
            gradientEndPoint: options.gradientEndPoint
        };
    }

    /**
     * Check if point is inside the mask (black pixel)
     */
    isPointInMask(point, maskCanvas, ctx) {
        const x = Math.floor(point.x);
        const y = Math.floor(point.y);

        if (x < 0 || y < 0 || x >= maskCanvas.width || y >= maskCanvas.height) {
            return false;
        }

        try {
            const imageData = ctx.getImageData(x, y, 1, 1);
            // Black pixel = inside shape (RGB all 0 or very low)
            return imageData.data[0] < 128; // Check if pixel is dark (black or near-black)
        } catch (e) {
            return false;
        }
    }

    /**
     * Generate pattern inside a shape or multiple shapes
     * @param {SVGPathElement|Array|Array<Array>} shape - SVG path element, array of points, or array of shape arrays
     * @param {Object} options - Configuration options
     * @returns {Object} - Pattern data with paths and circles
     */
    generate(shape, options = {}) {
        // Handle multiple shapes (array of arrays)
        if (Array.isArray(shape) && shape.length > 0 && Array.isArray(shape[0]) && typeof shape[0][0] === 'object' && shape[0][0].x !== undefined) {
            // Multiple shapes - combine them
            return this.generateForMultipleShapes(shape, options);
        }
        const {
            density = 20,
            lineLength = 80,
            lineThickness = 2,
            circleRadius = 4,
            style = 'organic',
            lineColor = '#00ff00'
        } = options;

        this.segments = [];
        this.usedSpace = [];

        // Get shape bounds and create spatial grid
        const bounds = this.getShapeBounds(shape);
        // Density controls spacing between potential segment start points
        const gridSize = density;

        // Create a set of potential line segments
        const potentialSegments = this.createPotentialSegments(bounds, gridSize, style, lineLength);

        // Filter and prioritize segments
        // Handle text objects specially
        let validSegments;
        if (shape && typeof shape === 'object' && shape.type === 'text' && shape.textData) {
            // Use text element for accurate detection
            validSegments = potentialSegments.filter(segment => {
                const midPoint = {
                    x: (segment.start.x + segment.end.x) / 2,
                    y: (segment.start.y + segment.end.y) / 2
                };
                return this.isPointInText(midPoint, shape.textData) &&
                       this.isPointInText(segment.start, shape.textData) &&
                       this.isPointInText(segment.end, shape.textData);
            });
        } else {
            const shapeToCheck = (shape && typeof shape === 'object' && shape.bounds) ? shape.bounds : shape;
            validSegments = this.filterSegments(potentialSegments, shapeToCheck);
        }

        // Sort by length (longer first)
        validSegments.sort((a, b) => b.length - a.length);

        // Place segments starting from longest
        const placedSegments = [];
        // Account for line thickness and circle radius in spacing
        const minSpacing = Math.max(gridSize * 0.3, lineThickness + circleRadius);
        for (const segment of validSegments) {
            if (this.canPlaceSegment(segment, placedSegments, minSpacing, lineThickness, circleRadius)) {
                placedSegments.push(segment);
            }
        }

        // Find intersections and create forks
        const forks = this.findIntersections(placedSegments);

        // Extract endpoints for circles (before shortening, so circles are at original positions)
        const endpoints = this.getEndpoints(placedSegments, forks);

        // Shorten segments to leave space for circles at endpoints (unless at forks)
        const shortenedSegments = this.shortenSegmentsForCircles(placedSegments, forks, circleRadius);

        return {
            segments: shortenedSegments,
            circles: endpoints,
            forks: forks,
            lineThickness,
            circleRadius,
            lineColor,
            gradientType: options.gradientType || 'none',
            gradientColor: options.gradientColor || lineColor
        };
    }

    /**
     * Generate pattern for multiple shapes combined
     */
    generateForMultipleShapes(shapes, options = {}) {
        const {
            density = 20,
            lineLength = 80,
            lineThickness = 2,
            circleRadius = 4,
            style = 'organic',
            lineColor = '#00ff00'
        } = options;

        this.segments = [];
        this.usedSpace = [];

        // Get combined bounds of all shapes
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        shapes.forEach(shape => {
            if (Array.isArray(shape) && shape.length > 0) {
                shape.forEach(point => {
                    minX = Math.min(minX, point.x);
                    minY = Math.min(minY, point.y);
                    maxX = Math.max(maxX, point.x);
                    maxY = Math.max(maxY, point.y);
                });
            }
        });

        const bounds = {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };

        const gridSize = density;
        const minSpacing = Math.max(gridSize * 0.3, lineThickness + circleRadius);

        // Create potential segments
        const potentialSegments = this.createPotentialSegments(bounds, gridSize, style, lineLength);

        // Filter segments to only those inside any of the shapes
        const validSegments = potentialSegments.filter(segment => {
            // Check if segment is inside any shape
            return shapes.some(shape => {
                // Handle text objects specially
                if (shape && typeof shape === 'object' && shape.type === 'text' && shape.textData) {
                    // For text, check multiple points along the segment
                    const pointsToCheck = [];
                    // Add start, end, and several points along the segment
                    pointsToCheck.push(segment.start);
                    pointsToCheck.push(segment.end);
                    // Add midpoints for curved segments
                    if (segment.points && segment.points.length > 2) {
                        for (let i = 1; i < segment.points.length - 1; i++) {
                            pointsToCheck.push(segment.points[i]);
                        }
                    } else {
                        const midPoint = {
                            x: (segment.start.x + segment.end.x) / 2,
                            y: (segment.start.y + segment.end.y) / 2
                        };
                        pointsToCheck.push(midPoint);
                    }

                    // Check if any points are inside text (lenient - include if any part touches text)
                    const pointsInside = pointsToCheck.filter(p => this.isPointInText(p, shape.textData));
                    // Include segment if any point is inside (more lenient for text)
                    return pointsInside.length > 0;
                }

                const midPoint = {
                    x: (segment.start.x + segment.end.x) / 2,
                    y: (segment.start.y + segment.end.y) / 2
                };
                const shapeToCheck = (shape && typeof shape === 'object' && shape.bounds) ? shape.bounds : shape;
                return this.isPointInShape(midPoint, shapeToCheck) &&
                       this.isPointInShape(segment.start, shapeToCheck) &&
                       this.isPointInShape(segment.end, shapeToCheck);
            });
        });

        // Sort by length (longer first)
        validSegments.sort((a, b) => b.length - a.length);

        // Place segments starting from longest
        const placedSegments = [];
        for (const segment of validSegments) {
            if (this.canPlaceSegment(segment, placedSegments, minSpacing, lineThickness, circleRadius)) {
                placedSegments.push(segment);
            }
        }

        // Find intersections and create forks
        const forks = this.findIntersections(placedSegments);

        // Extract endpoints for circles (before shortening)
        const endpoints = this.getEndpoints(placedSegments, forks);

        // Shorten segments to leave space for circles at endpoints (unless at forks)
        const shortenedSegments = this.shortenSegmentsForCircles(placedSegments, forks, circleRadius);

        return {
            segments: shortenedSegments,
            circles: endpoints,
            forks: forks,
            lineThickness,
            circleRadius,
            lineColor,
            gradientType: options.gradientType || 'none',
            gradientColor: options.gradientColor || lineColor
        };
    }

    /**
     * Get bounding box of shape
     */
    getShapeBounds(shape) {
        if (shape instanceof SVGPathElement) {
            const bbox = shape.getBBox();
            return {
                x: bbox.x,
                y: bbox.y,
                width: bbox.width,
                height: bbox.height
            };
        } else if (Array.isArray(shape) && shape.length > 0) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            shape.forEach(point => {
                minX = Math.min(minX, point.x);
                minY = Math.min(minY, point.y);
                maxX = Math.max(maxX, point.x);
                maxY = Math.max(maxY, point.y);
            });
            return {
                x: minX,
                y: minY,
                width: maxX - minX,
                height: maxY - minY
            };
        }
        return { x: 0, y: 0, width: 800, height: 600 };
    }

    /**
     * Create potential line segments
     * @param {Object} bounds - Bounding box
     * @param {number} gridSize - Spacing between potential segment start points (density)
     * @param {string} style - Pattern style (grid or organic)
     * @param {number} lineLength - Average length for segments
     */
    createPotentialSegments(bounds, gridSize, style, lineLength = 80, minLength = null, maxLength = null) {
        const segments = [];
        const angles = [0, 45, 90, 135]; // 45-degree angles

        // Use min/max if provided, otherwise use lineLength with variation
        const useRange = minLength !== null && maxLength !== null;
        const getLength = () => {
            if (useRange) {
                return minLength + Math.random() * (maxLength - minLength);
            }
            return lineLength * (0.7 + Math.random() * 0.6); // 70% to 130% of lineLength
        };

        if (style === 'grid') {
            // Grid-based pattern - density controls grid spacing
            for (let x = bounds.x; x < bounds.x + bounds.width; x += gridSize) {
                for (let y = bounds.y; y < bounds.y + bounds.height; y += gridSize) {
                    const angle = angles[Math.floor(Math.random() * angles.length)];
                    const length = getLength();
                    segments.push(this.createSegment(x, y, angle, length));
                }
            }
        } else {
            // Organic pattern - density controls how many segments to generate
            const numSegments = Math.floor((bounds.width * bounds.height) / (gridSize * gridSize * 0.5));
            for (let i = 0; i < numSegments; i++) {
                const startX = bounds.x + Math.random() * bounds.width;
                const startY = bounds.y + Math.random() * bounds.height;
                const angle = angles[Math.floor(Math.random() * angles.length)];
                const length = getLength();
                const numCurves = Math.floor(Math.random() * 3); // 0-2 curves
                segments.push(this.createCurvedSegment(startX, startY, angle, length, numCurves));
            }
        }

        return segments;
    }

    /**
     * Create a straight line segment
     */
    createSegment(x, y, angle, length) {
        const rad = (angle * Math.PI) / 180;
        const endX = x + Math.cos(rad) * length;
        const endY = y + Math.sin(rad) * length;
        return {
            start: { x, y },
            end: { x: endX, y: endY },
            angle,
            length,
            points: [{ x, y }, { x: endX, y: endY }]
        };
    }

    /**
     * Create a curved segment with 45-degree turns
     */
    createCurvedSegment(startX, startY, startAngle, totalLength, numCurves) {
        const points = [{ x: startX, y: startY }];
        let currentX = startX;
        let currentY = startY;
        let currentAngle = startAngle;
        const segmentLength = totalLength / (numCurves + 1);

        for (let i = 0; i <= numCurves; i++) {
            const rad = (currentAngle * Math.PI) / 180;
            const length = segmentLength * (0.8 + Math.random() * 0.4);
            currentX += Math.cos(rad) * length;
            currentY += Math.sin(rad) * length;
            points.push({ x: currentX, y: currentY });

            if (i < numCurves) {
                // Turn 45 degrees (random direction)
                currentAngle += (Math.random() < 0.5 ? -45 : 45);
                currentAngle = ((currentAngle % 360) + 360) % 360;
            }
        }

        return {
            start: points[0],
            end: points[points.length - 1],
            angle: startAngle,
            length: totalLength,
            points: points
        };
    }

    /**
     * Filter segments to only those inside the shape
     */
    filterSegments(segments, shape) {
        return segments.filter(segment => {
            // Check multiple points along the segment to ensure it's inside
            const startIn = this.isPointInShape(segment.start, shape);
            const endIn = this.isPointInShape(segment.end, shape);
            const midPoint = {
                x: (segment.start.x + segment.end.x) / 2,
                y: (segment.start.y + segment.end.y) / 2
            };
            const midIn = this.isPointInShape(midPoint, shape);

            // For curved segments, check intermediate points too
            if (segment.points.length > 2) {
                let allPointsIn = true;
                for (let i = 1; i < segment.points.length - 1; i++) {
                    if (!this.isPointInShape(segment.points[i], shape)) {
                        allPointsIn = false;
                        break;
                    }
                }
                return allPointsIn && startIn && endIn;
            }

            // For straight segments, at least start and end should be in
            return startIn && endIn;
        });
    }

    /**
     * Check if point is inside shape
     */
    isPointInShape(point, shape) {
        if (shape instanceof SVGPathElement) {
            // Use SVG path check
            const svg = shape.ownerSVGElement;
            if (!svg) return false;
            const pointElement = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            pointElement.setAttribute('cx', point.x);
            pointElement.setAttribute('cy', point.y);
            pointElement.setAttribute('r', 1);
            svg.appendChild(pointElement);
            const isInside = shape.isPointInFill ? shape.isPointInFill(new DOMPoint(point.x, point.y)) : false;
            svg.removeChild(pointElement);
            return isInside;
        } else if (Array.isArray(shape)) {
            // Point-in-polygon test
            return this.pointInPolygon(point, shape);
        }
        return false;
    }

    /**
     * Check if point is inside SVG text element (with transform applied)
     * Uses canvas-based pixel detection for accuracy
     */
    isPointInText(point, textData) {
        if (!textData) return false;

        // Try canvas method first (most accurate)
        if (textData.canvas && textData.ctx) {
            try {
                // Use canvas pixel data for accurate detection
                const x = Math.floor(point.x);
                const y = Math.floor(point.y);

                // Check bounds
                if (x < 0 || y < 0 || x >= textData.canvas.width || y >= textData.canvas.height) {
                    return false;
                }

                // Get pixel data at this point
                const imageData = textData.ctx.getImageData(x, y, 1, 1);
                // If alpha channel > 0, point is inside text
                if (imageData.data[3] > 0) {
                    return true;
                }

                // Also check nearby pixels for better accuracy (small radius)
                const checkRadius = 1;
                for (let dx = -checkRadius; dx <= checkRadius; dx++) {
                    for (let dy = -checkRadius; dy <= checkRadius; dy++) {
                        if (dx === 0 && dy === 0) continue;
                        const checkX = x + dx;
                        const checkY = y + dy;
                        if (checkX >= 0 && checkY >= 0 && checkX < textData.canvas.width && checkY < textData.canvas.height) {
                            try {
                                const nearbyData = textData.ctx.getImageData(checkX, checkY, 1, 1);
                                if (nearbyData.data[3] > 0) {
                                    return true;
                                }
                            } catch (e) {
                                // Continue
                            }
                        }
                    }
                }
            } catch (e) {
                // Fall through to SVG method
            }
        }

        // Fallback to SVG method
        return this.isPointInTextSVG(point, textData);
    }

    /**
     * Fallback SVG-based method for checking if point is in text
     */
    isPointInTextSVG(point, textData) {
        if (!textData || !textData.text || !textData.text.isPointInFill) return false;
        try {
            const centerX = textData.centerX;
            const centerY = textData.centerY;
            const scaleX = textData.scaleX || 1;
            const scaleY = textData.scaleY || 1;

            // Transform point to local coordinates
            // The transform is: translate(x,y) scale(sx,sy) translate(-x,-y)
            // To invert: translate(x,y) scale(1/sx,1/sy) translate(-x,-y)
            const localX = centerX + (point.x - centerX) / scaleX;
            const localY = centerY + (point.y - centerY) / scaleY;

            const domPoint = new DOMPoint(localX, localY);
            return textData.text.isPointInFill && textData.text.isPointInFill(domPoint);
        } catch (e2) {
            return false;
        }
    }

    /**
     * Point-in-polygon test using ray casting algorithm
     */
    pointInPolygon(point, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;
            const intersect = ((yi > point.y) !== (yj > point.y)) &&
                            (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    /**
     * Check if segment can be placed without crossing existing segments
     */
    canPlaceSegment(segment, placedSegments, minDistance, lineThickness = 2, circleRadius = 4) {
        const endpointThreshold = 3; // Pixels - endpoints closer than this are considered the same
        // Account for line thickness in distance calculations
        const effectiveMinDistance = minDistance + lineThickness / 2;
        // Minimum distance between circle centers to prevent overlap
        // Two circles with radius r need at least 2r distance between centers, plus padding
        const circleClearance = 2 * circleRadius + lineThickness + 3; // Extra 3px padding between circles

        for (const placed of placedSegments) {
            // Check if segments share endpoints (this is allowed for forks)
            const sharesStart = this.pointsClose(segment.start, placed.start, endpointThreshold) ||
                               this.pointsClose(segment.start, placed.end, endpointThreshold);
            const sharesEnd = this.pointsClose(segment.end, placed.start, endpointThreshold) ||
                             this.pointsClose(segment.end, placed.end, endpointThreshold);
            const sharesPlacedStart = this.pointsClose(placed.start, segment.start, endpointThreshold) ||
                                     this.pointsClose(placed.start, segment.end, endpointThreshold);
            const sharesPlacedEnd = this.pointsClose(placed.end, segment.start, endpointThreshold) ||
                                   this.pointsClose(placed.end, segment.end, endpointThreshold);

            const sharesEndpoints = sharesStart || sharesEnd || sharesPlacedStart || sharesPlacedEnd;

            // Even if segments share endpoints, we still need to check if they're too close along their paths
            // But we'll use a more lenient threshold for endpoint sharing cases

            // Check if new segment endpoints are too close to placed segment endpoints (that will have circles)
            // This prevents circles at endpoints from touching each other
            // We need to check this even if endpoints are "close" but not exactly shared
            const distToPlacedStart = this.pointDistance(segment.start, placed.start);
            const distToPlacedEnd = this.pointDistance(segment.start, placed.end);
            const distToPlacedStart2 = this.pointDistance(segment.end, placed.start);
            const distToPlacedEnd2 = this.pointDistance(segment.end, placed.end);

            // Check if any endpoint of the new segment is too close to endpoints of placed segments
            // Only allow if endpoints are exactly shared (forks) - otherwise enforce circle clearance
            const startSharesStart = this.pointsClose(segment.start, placed.start, endpointThreshold);
            const startSharesEnd = this.pointsClose(segment.start, placed.end, endpointThreshold);
            const endSharesStart = this.pointsClose(segment.end, placed.start, endpointThreshold);
            const endSharesEnd = this.pointsClose(segment.end, placed.end, endpointThreshold);

            // If endpoints are not exactly shared, they must maintain circle clearance distance
            if (!startSharesStart && distToPlacedStart < circleClearance) return false;
            if (!startSharesEnd && distToPlacedEnd < circleClearance) return false;
            if (!endSharesStart && distToPlacedStart2 < circleClearance) return false;
            if (!endSharesEnd && distToPlacedEnd2 < circleClearance) return false;

            // Check if placed segment endpoints are too close to new segment's path
            // Skip if the endpoint is shared (fork)
            if (!sharesPlacedStart && !sharesPlacedEnd) {
                const distFromPlacedStartToSeg = this.pointToSegmentDistance(placed.start, segment);
                const distFromPlacedEndToSeg = this.pointToSegmentDistance(placed.end, segment);

                if (distFromPlacedStartToSeg < circleClearance || distFromPlacedEndToSeg < circleClearance) {
                    return false;
                }
            }

            // Check if new segment endpoints are too close to placed segment's path
            // Skip if the endpoint is shared (fork)
            if (!sharesStart && !sharesEnd) {
                const distFromNewStartToPlaced = this.pointToSegmentDistance(segment.start, placed);
                const distFromNewEndToPlaced = this.pointToSegmentDistance(segment.end, placed);

                if (distFromNewStartToPlaced < circleClearance || distFromNewEndToPlaced < circleClearance) {
                    return false;
                }
            }

            // Check if segments cross each other (not at endpoints)
            const intersection = this.findSegmentIntersection(segment, placed);
            if (intersection) {
                // Check if intersection is at an endpoint (allowed) or in the middle (not allowed)
                const isAtEndpoint = this.pointsClose(intersection, segment.start, endpointThreshold) ||
                                    this.pointsClose(intersection, segment.end, endpointThreshold) ||
                                    this.pointsClose(intersection, placed.start, endpointThreshold) ||
                                    this.pointsClose(intersection, placed.end, endpointThreshold);

                if (!isAtEndpoint) {
                    // Segments cross in the middle - not allowed
                    return false;
                }
            }

            // Always check if segments are too close along their paths (accounting for line thickness)
            // This check runs even if endpoints are shared, to prevent parallel segments from overlapping
            if (this.segmentsTooClose(segment, placed, effectiveMinDistance)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Calculate distance from a point to a line segment
     */
    pointToSegmentDistance(point, segment) {
        let minDist = Infinity;

        // Check distance to each segment of the path
        for (let i = 0; i < segment.points.length - 1; i++) {
            const p1 = segment.points[i];
            const p2 = segment.points[i + 1];

            // Vector from p1 to p2
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const segLengthSq = dx * dx + dy * dy;

            if (segLengthSq < 0.001) {
                // Degenerate segment, just use point distance
                minDist = Math.min(minDist, this.pointDistance(point, p1));
                continue;
            }

            // Project point onto line segment
            const t = Math.max(0, Math.min(1, ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / segLengthSq));
            const projX = p1.x + t * dx;
            const projY = p1.y + t * dy;
            const projPoint = { x: projX, y: projY };

            const dist = this.pointDistance(point, projPoint);
            minDist = Math.min(minDist, dist);
        }

        return minDist;
    }

    /**
     * Check if two points are close to each other
     */
    pointsClose(p1, p2, threshold) {
        return this.pointDistance(p1, p2) < threshold;
    }

    /**
     * Check if two segments are too close (accounting for line thickness)
     * Checks minimum distance along entire segment paths
     */
    segmentsTooClose(seg1, seg2, minDistance) {
        // Check minimum distance between all points on both segments
        let minDist = Infinity;

        // Sample points along seg1 and check distance to seg2
        for (let i = 0; i < seg1.points.length; i++) {
            const dist = this.pointToSegmentDistance(seg1.points[i], seg2);
            minDist = Math.min(minDist, dist);
        }

        // Sample points along seg2 and check distance to seg1
        for (let i = 0; i < seg2.points.length; i++) {
            const dist = this.pointToSegmentDistance(seg2.points[i], seg1);
            minDist = Math.min(minDist, dist);
        }

        // Also check distances between all segment sub-paths
        for (let i = 0; i < seg1.points.length - 1; i++) {
            for (let j = 0; j < seg2.points.length - 1; j++) {
                const p1 = seg1.points[i];
                const p2 = seg1.points[i + 1];
                const p3 = seg2.points[j];
                const p4 = seg2.points[j + 1];

                // Check distance between these two line segments
                const segDist = this.segmentToSegmentDistance(p1, p2, p3, p4);
                minDist = Math.min(minDist, segDist);
            }
        }

        return minDist < minDistance;
    }

    /**
     * Calculate minimum distance between two line segments
     */
    segmentToSegmentDistance(p1, p2, p3, p4) {
        // Check if segments intersect
        const intersection = this.lineIntersection(p1, p2, p3, p4);
        if (intersection) {
            return 0; // They intersect, distance is 0
        }

        // Check distances from endpoints of first segment to second segment
        const d1 = this.pointToLineSegmentDistance(p1, p3, p4);
        const d2 = this.pointToLineSegmentDistance(p2, p3, p4);

        // Check distances from endpoints of second segment to first segment
        const d3 = this.pointToLineSegmentDistance(p3, p1, p2);
        const d4 = this.pointToLineSegmentDistance(p4, p1, p2);

        return Math.min(d1, d2, d3, d4);
    }

    /**
     * Calculate distance from a point to a line segment (single segment)
     */
    pointToLineSegmentDistance(point, segStart, segEnd) {
        const dx = segEnd.x - segStart.x;
        const dy = segEnd.y - segStart.y;
        const segLengthSq = dx * dx + dy * dy;

        if (segLengthSq < 0.001) {
            // Degenerate segment, just use point distance
            return this.pointDistance(point, segStart);
        }

        // Project point onto line segment
        const t = Math.max(0, Math.min(1, ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / segLengthSq));
        const projX = segStart.x + t * dx;
        const projY = segStart.y + t * dy;
        const projPoint = { x: projX, y: projY };

        return this.pointDistance(point, projPoint);
    }

    /**
     * Calculate distance between two points
     */
    pointDistance(p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Find forks where segments meet at endpoints (no crossings allowed)
     */
    findIntersections(segments) {
        const forks = [];
        const forkPoints = new Map(); // point -> array of segment indices
        const endpointThreshold = 3; // Same threshold as in canPlaceSegment

        // Find all endpoint connections
        for (let i = 0; i < segments.length; i++) {
            const seg1 = segments[i];

            // Check start point
            const startKey = this.getPointKey(seg1.start, endpointThreshold);
            if (!forkPoints.has(startKey)) {
                forkPoints.set(startKey, []);
            }
            forkPoints.get(startKey).push(i);

            // Check end point
            const endKey = this.getPointKey(seg1.end, endpointThreshold);
            if (!forkPoints.has(endKey)) {
                forkPoints.set(endKey, []);
            }
            forkPoints.get(endKey).push(i);
        }

        // Create forks where multiple segments meet at the same point
        forkPoints.forEach((segmentIndices, pointKey) => {
            if (segmentIndices.length > 1) {
                // Multiple segments meet at this point - it's a fork
                // Use the actual average position of all endpoints at this location
                const point = this.getAverageEndpointPosition(segments, segmentIndices, pointKey, endpointThreshold);
                forks.push({
                    point: point,
                    segments: segmentIndices,
                    type: segmentIndices.length > 2 ? 'cross' : 't-junction'
                });
            }
        });

        return forks;
    }

    /**
     * Get average position of endpoints that are grouped together
     */
    getAverageEndpointPosition(segments, segmentIndices, pointKey, threshold) {
        const basePoint = this.parsePointKey(pointKey);
        let sumX = 0, sumY = 0, count = 0;

        segmentIndices.forEach(segIdx => {
            const seg = segments[segIdx];
            if (this.pointsClose(seg.start, basePoint, threshold * 2)) {
                sumX += seg.start.x;
                sumY += seg.start.y;
                count++;
            }
            if (this.pointsClose(seg.end, basePoint, threshold * 2)) {
                sumX += seg.end.x;
                sumY += seg.end.y;
                count++;
            }
        });

        return count > 0 ? { x: sumX / count, y: sumY / count } : basePoint;
    }

    /**
     * Get a string key for a point (for comparison with threshold)
     */
    getPointKey(point, threshold = 3) {
        // Round to nearest threshold to group nearby points
        const roundedX = Math.round(point.x / threshold) * threshold;
        const roundedY = Math.round(point.y / threshold) * threshold;
        return `${roundedX},${roundedY}`;
    }

    /**
     * Parse a point key back to coordinates
     */
    parsePointKey(key) {
        const [x, y] = key.split(',').map(Number);
        return { x, y };
    }

    /**
     * Find intersection point between two segments
     */
    findSegmentIntersection(seg1, seg2) {
        // Check all points in curved segments
        for (let i = 0; i < seg1.points.length - 1; i++) {
            for (let j = 0; j < seg2.points.length - 1; j++) {
                const p1 = seg1.points[i];
                const p2 = seg1.points[i + 1];
                const p3 = seg2.points[j];
                const p4 = seg2.points[j + 1];

                const intersection = this.lineIntersection(p1, p2, p3, p4);
                if (intersection && this.pointOnSegment(intersection, p1, p2) &&
                    this.pointOnSegment(intersection, p3, p4)) {
                    return intersection;
                }
            }
        }
        return null;
    }

    /**
     * Find intersection of two line segments
     */
    lineIntersection(p1, p2, p3, p4) {
        const x1 = p1.x, y1 = p1.y;
        const x2 = p2.x, y2 = p2.y;
        const x3 = p3.x, y3 = p3.y;
        const x4 = p4.x, y4 = p4.y;

        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(denom) < 0.001) return null; // Parallel lines

        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            return {
                x: x1 + t * (x2 - x1),
                y: y1 + t * (y2 - y1)
            };
        }
        return null;
    }

    /**
     * Check if point is on segment
     */
    pointOnSegment(point, segStart, segEnd) {
        const distToStart = this.pointDistance(point, segStart);
        const distToEnd = this.pointDistance(point, segEnd);
        const segLength = this.pointDistance(segStart, segEnd);
        return Math.abs(distToStart + distToEnd - segLength) < 1;
    }

    /**
     * Determine fork type (T-junction or cross)
     */
    getForkType(seg1, seg2, intersection) {
        const angle1 = Math.atan2(seg1.end.y - seg1.start.y, seg1.end.x - seg1.start.x);
        const angle2 = Math.atan2(seg2.end.y - seg2.start.y, seg2.end.x - seg2.start.x);
        const angleDiff = Math.abs(angle1 - angle2);
        const normalizedDiff = Math.min(angleDiff, 2 * Math.PI - angleDiff);

        // If angles are close to perpendicular, it's a cross
        if (normalizedDiff > Math.PI / 3 && normalizedDiff < 2 * Math.PI / 3) {
            return 'cross';
        }
        return 't-junction';
    }

    /**
     * Shorten segments to leave space for circles at endpoints (unless at forks)
     */
    shortenSegmentsForCircles(segments, forks, circleRadius) {
        const forkPoints = new Set();
        const endpointThreshold = 3;

        // Mark fork points
        forks.forEach(fork => {
            const key = this.getPointKey(fork.point, endpointThreshold);
            forkPoints.add(key);
        });

        return segments.map(segment => {
            const startKey = this.getPointKey(segment.start, endpointThreshold);
            const endKey = this.getPointKey(segment.end, endpointThreshold);
            const isStartFork = forkPoints.has(startKey);
            const isEndFork = forkPoints.has(endKey);

            // Calculate direction vectors
            let newStart = { ...segment.start };
            let newEnd = { ...segment.end };
            let newPoints = [...segment.points];

            // Shorten from start if not a fork
            if (!isStartFork && segment.points.length > 1) {
                const dx = segment.points[1].x - segment.points[0].x;
                const dy = segment.points[1].y - segment.points[0].y;
                const length = Math.sqrt(dx * dx + dy * dy);
                if (length > 0) {
                    const shortenBy = circleRadius + 1; // Add 1px padding
                    const ratio = Math.max(0, (length - shortenBy) / length);
                    newStart = {
                        x: segment.points[0].x + dx * (1 - ratio),
                        y: segment.points[0].y + dy * (1 - ratio)
                    };
                    newPoints[0] = newStart;
                }
            }

            // Shorten from end if not a fork
            if (!isEndFork && segment.points.length > 1) {
                const lastIdx = segment.points.length - 1;
                const dx = segment.points[lastIdx].x - segment.points[lastIdx - 1].x;
                const dy = segment.points[lastIdx].y - segment.points[lastIdx - 1].y;
                const length = Math.sqrt(dx * dx + dy * dy);
                if (length > 0) {
                    const shortenBy = circleRadius + 1; // Add 1px padding
                    const ratio = Math.max(0, (length - shortenBy) / length);
                    newEnd = {
                        x: segment.points[lastIdx].x - dx * (1 - ratio),
                        y: segment.points[lastIdx].y - dy * (1 - ratio)
                    };
                    newPoints[lastIdx] = newEnd;
                }
            }

            return {
                ...segment,
                start: newStart,
                end: newEnd,
                points: newPoints
            };
        });
    }

    /**
     * Get endpoints for circles (excluding fork points)
     */
    getEndpoints(segments, forks) {
        const endpoints = [];
        const forkPoints = new Set();
        const endpointThreshold = 3;

        // Mark fork points using the same threshold
        forks.forEach(fork => {
            const key = this.getPointKey(fork.point, endpointThreshold);
            forkPoints.add(key);
        });

        // Collect segment endpoints that aren't forks
        segments.forEach(segment => {
            const startKey = this.getPointKey(segment.start, endpointThreshold);
            const endKey = this.getPointKey(segment.end, endpointThreshold);

            if (!forkPoints.has(startKey)) {
                endpoints.push(segment.start);
            }
            if (!forkPoints.has(endKey)) {
                endpoints.push(segment.end);
            }
        });

        return endpoints;
    }

    /**
     * Render pattern to SVG
     */
    renderToSVG(pattern, svgElement) {
        const patternLayer = svgElement.querySelector('#patternLayer') || svgElement;
        const svg = svgElement.ownerSVGElement || svgElement;

        // Clear existing pattern
        while (patternLayer.firstChild) {
            patternLayer.removeChild(patternLayer.firstChild);
        }

        // Get canvas dimensions for gradient
        const canvasWidth = parseFloat(svg.getAttribute('width') || svgElement.getAttribute('width') || 800);
        const canvasHeight = parseFloat(svg.getAttribute('height') || svgElement.getAttribute('height') || 600);

        // Get or create defs for gradients
        let defs = svg.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            svg.insertBefore(defs, svg.firstChild);
        }

        // Clear existing gradients
        const existingGradients = defs.querySelectorAll('linearGradient, radialGradient');
        existingGradients.forEach(g => g.remove());

        const gradientType = pattern.gradientType || 'none';
        const gradientColor = pattern.gradientColor || pattern.lineColor;
        const baseColor = pattern.lineColor;

        // Use custom gradient points if provided, otherwise use defaults
        let gradientStart = pattern.gradientStartPoint;
        let gradientEnd = pattern.gradientEndPoint;

        if (!gradientStart || !gradientEnd) {
            // Default gradient points
            if (gradientType === 'linear') {
                gradientStart = { x: canvasWidth / 2, y: canvasHeight };
                gradientEnd = { x: canvasWidth / 2, y: 0 };
            } else {
                gradientStart = { x: canvasWidth / 2, y: canvasHeight / 2 };
                gradientEnd = { x: canvasWidth / 2, y: canvasHeight / 2 };
            }
        }

        // Create a single global gradient definition if needed
        let gradientId = null;
        if (gradientType !== 'none') {
            gradientId = `patternGradient-${Date.now()}`;

            if (gradientType === 'linear') {
                // Linear gradient using custom start and end points
                const linearGradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
                linearGradient.setAttribute('id', gradientId);
                linearGradient.setAttribute('x1', gradientStart.x);
                linearGradient.setAttribute('y1', gradientStart.y);
                linearGradient.setAttribute('x2', gradientEnd.x);
                linearGradient.setAttribute('y2', gradientEnd.y);
                linearGradient.setAttribute('gradientUnits', 'userSpaceOnUse');

                const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
                stop1.setAttribute('offset', '0%');
                stop1.setAttribute('stop-color', baseColor);
                linearGradient.appendChild(stop1);

                const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
                stop2.setAttribute('offset', '100%');
                stop2.setAttribute('stop-color', gradientColor);
                linearGradient.appendChild(stop2);

                defs.appendChild(linearGradient);
            } else if (gradientType === 'radial') {
                // Radial gradient: center at start point, radius to end point
                const radialGradient = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
                radialGradient.setAttribute('id', gradientId);
                radialGradient.setAttribute('cx', gradientStart.x);
                radialGradient.setAttribute('cy', gradientStart.y);
                // Calculate radius as distance from start to end point
                const dx = gradientEnd.x - gradientStart.x;
                const dy = gradientEnd.y - gradientStart.y;
                const radius = Math.sqrt(dx * dx + dy * dy) || 100; // Default to 100 if points are same
                radialGradient.setAttribute('r', radius);
                radialGradient.setAttribute('gradientUnits', 'userSpaceOnUse');

                const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
                stop1.setAttribute('offset', '0%');
                stop1.setAttribute('stop-color', baseColor);
                radialGradient.appendChild(stop1);

                const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
                stop2.setAttribute('offset', '100%');
                stop2.setAttribute('stop-color', gradientColor);
                radialGradient.appendChild(stop2);

                defs.appendChild(radialGradient);
            }
        }

        // Helper function to set stroke color/gradient
        const setStroke = (element) => {
            if (gradientType !== 'none' && gradientId) {
                element.setAttribute('stroke', `url(#${gradientId})`);
            } else {
                element.setAttribute('stroke', baseColor);
            }
        };

        // Render segments - all use the same global gradient
        pattern.segments.forEach(segment => {
            if (segment.points.length > 2) {
                // Curved path
                let pathData = `M ${segment.points[0].x} ${segment.points[0].y}`;
                for (let i = 1; i < segment.points.length; i++) {
                    pathData += ` L ${segment.points[i].x} ${segment.points[i].y}`;
                }
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', pathData);
                setStroke(path);
                path.setAttribute('stroke-width', pattern.lineThickness);
                path.setAttribute('fill', 'none');
                patternLayer.appendChild(path);
            } else {
                // Straight line
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', segment.start.x);
                line.setAttribute('y1', segment.start.y);
                line.setAttribute('x2', segment.end.x);
                line.setAttribute('y2', segment.end.y);
                setStroke(line);
                line.setAttribute('stroke-width', pattern.lineThickness);
                patternLayer.appendChild(line);
            }
        });

        // Render circles at endpoints (stroke only) - all use the same global gradient
        pattern.circles.forEach(point => {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', point.x);
            circle.setAttribute('cy', point.y);
            circle.setAttribute('r', pattern.circleRadius);
            circle.setAttribute('fill', 'none');
            setStroke(circle);
            circle.setAttribute('stroke-width', pattern.lineThickness);
            patternLayer.appendChild(circle);
        });

        // Render forks (stroke only) - all use the same global gradient
        pattern.forks.forEach(fork => {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', fork.point.x);
            circle.setAttribute('cy', fork.point.y);
            circle.setAttribute('r', pattern.circleRadius * 1.2);
            circle.setAttribute('fill', 'none');
            setStroke(circle);
            circle.setAttribute('stroke-width', pattern.lineThickness);
            patternLayer.appendChild(circle);
        });
    }
}

