const THREE = require('./CanvasRender');

var Canvas = require('canvas')
  , Image = Canvas.Image;

let userImg;

THREE.EffectComposer = function ( renderer, renderTarget ) {

    this.renderer = renderer;
    if ( renderTarget === undefined ) {
        var width = userImg.width || 1;
        var height = userImg.height || 1;
        var parameters = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBFormat, stencilBuffer: false };

        renderTarget = new THREE.WebGLRenderTarget( width, height, parameters );

    }

    this.renderTarget1 = renderTarget;
    this.renderTarget2 = renderTarget.clone();

    this.writeBuffer = this.renderTarget1;
    this.readBuffer = this.renderTarget2;

    this.passes = [];

    if ( THREE.CopyShader === undefined )
        console.error( "THREE.EffectComposer relies on THREE.CopyShader" );

    this.copyPass = new THREE.ShaderPass( THREE.CopyShader );

};

THREE.EffectComposer.prototype = {

    swapBuffers: function() {

        var tmp = this.readBuffer;
        this.readBuffer = this.writeBuffer;
        this.writeBuffer = tmp;

    },

    addPass: function ( pass ) {

        this.passes.push( pass );

    },

    insertPass: function ( pass, index ) {

        this.passes.splice( index, 0, pass );

    },

    render: function ( delta ) {

        this.writeBuffer = this.renderTarget1;
        this.readBuffer = this.renderTarget2;

        var maskActive = false;

        var pass, i, il = this.passes.length;

        for ( i = 0; i < il; i ++ ) {

            pass = this.passes[ i ];

            if ( !pass.enabled ) continue;

            pass.render( this.renderer, this.writeBuffer, this.readBuffer, delta, maskActive );

            if ( pass.needsSwap ) {

                if ( maskActive ) {

                    var context = this.renderer.context;

                    context.stencilFunc( context.NOTEQUAL, 1, 0xffffffff );

                    this.copyPass.render( this.renderer, this.writeBuffer, this.readBuffer, delta );

                    context.stencilFunc( context.EQUAL, 1, 0xffffffff );

                }

                this.swapBuffers();

            }

            if ( pass instanceof THREE.MaskPass ) {

                maskActive = true;

            } else if ( pass instanceof THREE.ClearMaskPass ) {

                maskActive = false;

            }

        }

    },

    reset: function ( renderTarget ) {

        if ( renderTarget === undefined ) {

            renderTarget = this.renderTarget1.clone();

            renderTarget.width = window.innerWidth;
            renderTarget.height = window.innerHeight;

        }

        this.renderTarget1 = renderTarget;
        this.renderTarget2 = renderTarget.clone();

        this.writeBuffer = this.renderTarget1;
        this.readBuffer = this.renderTarget2;

    },

    setSize: function ( width, height ) {

        var renderTarget = this.renderTarget1.clone();

        renderTarget.width = width;
        renderTarget.height = height;

        this.reset( renderTarget );

    }

};

// shared ortho camera

THREE.EffectComposer.camera = new THREE.OrthographicCamera( -1, 1, 1, -1, 0, 1 );

THREE.EffectComposer.quad = new THREE.Mesh( new THREE.PlaneGeometry( 2, 2 ), null );

THREE.EffectComposer.scene = new THREE.Scene();
THREE.EffectComposer.scene.add( THREE.EffectComposer.quad );


THREE.RenderPass = function ( scene, camera, overrideMaterial, clearColor, clearAlpha ) {

    this.scene = scene;
    this.camera = camera;

    this.overrideMaterial = overrideMaterial;

    this.clearColor = clearColor;
    this.clearAlpha = ( clearAlpha !== undefined ) ? clearAlpha : 1;

    this.oldClearColor = new THREE.Color();
    this.oldClearAlpha = 1;

    this.enabled = true;
    this.clear = true;
    this.needsSwap = false;

};

THREE.RenderPass.prototype = {

    render: function ( renderer, writeBuffer, readBuffer, delta ) {

        this.scene.overrideMaterial = this.overrideMaterial;

        if ( this.clearColor ) {

            this.oldClearColor.copy( renderer.getClearColor() );
            this.oldClearAlpha = renderer.getClearAlpha();

            renderer.setClearColor( this.clearColor, this.clearAlpha );

        }

        renderer.render( this.scene, this.camera, readBuffer, this.clear );

        if ( this.clearColor ) {

            renderer.setClearColor( this.oldClearColor, this.oldClearAlpha );

        }

        this.scene.overrideMaterial = null;

    }

};




/**
 * @author alteredq / http://alteredqualia.com/
 */

THREE.ShaderPass = function ( shader, textureID ) {

    this.textureID = ( textureID !== undefined ) ? textureID : "tDiffuse";

    this.uniforms = THREE.UniformsUtils.clone( shader.uniforms );

    this.material = new THREE.ShaderMaterial( {

        uniforms: this.uniforms,
        vertexShader: shader.vertexShader,
        fragmentShader: shader.fragmentShader

    } );

    this.renderToScreen = false;

    this.enabled = true;
    this.needsSwap = true;
    this.clear = false;

};

THREE.ShaderPass.prototype = {

    render: function ( renderer, writeBuffer, readBuffer, delta ) {

        if ( this.uniforms[ this.textureID ] ) {

            this.uniforms[ this.textureID ].value = readBuffer;

        }

        THREE.EffectComposer.quad.material = this.material;

        if ( this.renderToScreen ) {

            renderer.render( THREE.EffectComposer.scene, THREE.EffectComposer.camera );

        } else {

            renderer.render( THREE.EffectComposer.scene, THREE.EffectComposer.camera, writeBuffer, this.clear );

        }

    }

};



/**
 * @author alteredq / http://alteredqualia.com/
 */

THREE.MaskPass = function ( scene, camera ) {

    this.scene = scene;
    this.camera = camera;

    this.enabled = true;
    this.clear = true;
    this.needsSwap = false;

    this.inverse = false;

};

THREE.MaskPass.prototype = {

    render: function ( renderer, writeBuffer, readBuffer, delta ) {

        var context = renderer.context;

        // don't update color or depth

        context.colorMask( false, false, false, false );
        context.depthMask( false );

        // set up stencil

        var writeValue, clearValue;

        if ( this.inverse ) {

            writeValue = 0;
            clearValue = 1;

        } else {

            writeValue = 1;
            clearValue = 0;

        }

        context.enable( context.STENCIL_TEST );
        context.stencilOp( context.REPLACE, context.REPLACE, context.REPLACE );
        context.stencilFunc( context.ALWAYS, writeValue, 0xffffffff );
        context.clearStencil( clearValue );

        // draw into the stencil buffer

        renderer.render( this.scene, this.camera, readBuffer, this.clear );
        renderer.render( this.scene, this.camera, writeBuffer, this.clear );

        // re-enable update of color and depth

        context.colorMask( true, true, true, true );
        context.depthMask( true );

        // only render where stencil is set to 1

        context.stencilFunc( context.EQUAL, 1, 0xffffffff );  // draw if == 1
        context.stencilOp( context.KEEP, context.KEEP, context.KEEP );

    }

};


THREE.ClearMaskPass = function () {

    this.enabled = true;

};

THREE.ClearMaskPass.prototype = {

    render: function ( renderer, writeBuffer, readBuffer, delta ) {

        var context = renderer.context;

        context.disable( context.STENCIL_TEST );

    }

};




/**
 * @author alteredq / http://alteredqualia.com/
 */

THREE.DotScreenPass = function ( center, angle, scale ) {

    if ( THREE.DotScreenShader === undefined )
        console.error( "THREE.DotScreenPass relies on THREE.DotScreenShader" );

    var shader = THREE.DotScreenShader;

    this.uniforms = THREE.UniformsUtils.clone( shader.uniforms );

    if ( center !== undefined ) this.uniforms[ "center" ].value.copy( center );
    if ( angle !== undefined ) this.uniforms[ "angle"].value = angle;
    if ( scale !== undefined ) this.uniforms[ "scale"].value = scale;

    this.material = new THREE.ShaderMaterial( {

        uniforms: this.uniforms,
        vertexShader: shader.vertexShader,
        fragmentShader: shader.fragmentShader

    } );

    this.enabled = true;
    this.renderToScreen = false;
    this.needsSwap = true;

};

THREE.DotScreenPass.prototype = {

    render: function ( renderer, writeBuffer, readBuffer, delta ) {

        this.uniforms[ "tDiffuse" ].value = readBuffer;
        this.uniforms[ "tSize" ].value.set( readBuffer.width, readBuffer.height );

        THREE.EffectComposer.quad.material = this.material;

        if ( this.renderToScreen ) {

            renderer.render( THREE.EffectComposer.scene, THREE.EffectComposer.camera );

        } else {

            renderer.render( THREE.EffectComposer.scene, THREE.EffectComposer.camera, writeBuffer, false );

        }

    }

};


/**
 * @author alteredq / http://alteredqualia.com/
 *
 * Bleach bypass shader [http://en.wikipedia.org/wiki/Bleach_bypass]
 * - based on Nvidia example
 * http://developer.download.nvidia.com/shaderlibrary/webpages/shader_library.html#post_bleach_bypass
 */

THREE.BleachBypassShader = {

    uniforms: {

        "tDiffuse": { type: "t", value: null },
        "opacity":  { type: "f", value: 1.0 }

    },

    vertexShader: [

        "varying vec2 vUv;",

        "void main() {",

            "vUv = uv;",
            "gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",

        "}"

    ].join("\n"),

    fragmentShader: [

        "uniform float opacity;",

        "uniform sampler2D tDiffuse;",

        "varying vec2 vUv;",

        "void main() {",

            "vec4 base = texture2D( tDiffuse, vUv );",

            "vec3 lumCoeff = vec3( 0.25, 0.65, 0.1 );",
            "float lum = dot( lumCoeff, base.rgb );",
            "vec3 blend = vec3( lum );",

            "float L = min( 1.0, max( 0.0, 10.0 * ( lum - 0.45 ) ) );",

            "vec3 result1 = 2.0 * base.rgb * blend;",
            "vec3 result2 = 1.0 - 2.0 * ( 1.0 - blend ) * ( 1.0 - base.rgb );",

            "vec3 newColor = mix( result1, result2, L );",

            "float A2 = opacity * base.a;",
            "vec3 mixRGB = A2 * newColor.rgb;",
            "mixRGB += ( ( 1.0 - A2 ) * base.rgb );",

            "gl_FragColor = vec4( mixRGB, base.a );",

        "}"

    ].join("\n")

};




/**
 * @author tapio / http://tapio.github.com/
 *
 * Brightness and contrast adjustment
 * https://github.com/evanw/glfx.js
 * brightness: -1 to 1 (-1 is solid black, 0 is no change, and 1 is solid white)
 * contrast: -1 to 1 (-1 is solid gray, 0 is no change, and 1 is maximum contrast)
 */

THREE.BrightnessContrastShader = {

    uniforms: {

        "tDiffuse":   { type: "t", value: null },
        "brightness": { type: "f", value: 0 },
        "contrast":   { type: "f", value: 0 }

    },

    vertexShader: [

        "varying vec2 vUv;",

        "void main() {",

            "vUv = uv;",

            "gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",

        "}"

    ].join("\n"),

    fragmentShader: [

        "uniform sampler2D tDiffuse;",
        "uniform float brightness;",
        "uniform float contrast;",

        "varying vec2 vUv;",

        "void main() {",

            "gl_FragColor = texture2D( tDiffuse, vUv );",

            "gl_FragColor.rgb += brightness;",

            "if (contrast > 0.0) {",
                "gl_FragColor.rgb = (gl_FragColor.rgb - 0.5) / (1.0 - contrast) + 0.5;",
            "} else {",
                "gl_FragColor.rgb = (gl_FragColor.rgb - 0.5) * (1.0 + contrast) + 0.5;",
            "}",

        "}"

    ].join("\n")

};



/**
 * @author alteredq / http://alteredqualia.com/
 *
 * Full-screen textured quad shader
 */

THREE.CopyShader = {

    uniforms: {

        "tDiffuse": { type: "t", value: null },
        "opacity":  { type: "f", value: 1.0 }

    },

    vertexShader: [

        "varying vec2 vUv;",

        "void main() {",

            "vUv = uv;",
            "gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",

        "}"

    ].join("\n"),

    fragmentShader: [

        "uniform float opacity;",

        "uniform sampler2D tDiffuse;",

        "varying vec2 vUv;",

        "void main() {",

            "vec4 texel = texture2D( tDiffuse, vUv );",
            "gl_FragColor = opacity * texel;",

        "}"

    ].join("\n")

};



/**
 * @author alteredq / http://alteredqualia.com/
 *
 * Dot screen shader
 */

THREE.DotScreenShader = {

    uniforms: {

        "tDiffuse": { type: "t", value: null },
        "tSize":    { type: "v2", value: new THREE.Vector2( 256, 256 ) },
        "center":   { type: "v2", value: new THREE.Vector2( 0.5, 0.5 ) },
        "angle":    { type: "f", value: 1.57 },
        "scale":    { type: "f", value: 1.0 }

    },

    vertexShader: [

        "varying vec2 vUv;",

        "void main() {",

            "vUv = uv;",
            "gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",

        "}"

    ].join("\n"),

    fragmentShader: [

        "uniform vec2 center;",
        "uniform float angle;",
        "uniform float scale;",
        "uniform vec2 tSize;",

        "uniform sampler2D tDiffuse;",

        "varying vec2 vUv;",

        "float pattern() {",

            "float s = sin( angle ), c = cos( angle );",

            "vec2 tex = vUv * tSize - center;",
            "vec2 point = vec2( c * tex.x - s * tex.y, s * tex.x + c * tex.y ) * scale;",

            "return ( sin( point.x ) * sin( point.y ) ) * 4.0;",

        "}",

        "void main() {",

            "vec4 color = texture2D( tDiffuse, vUv );",

            "float average = ( color.r + color.g + color.b ) / 3.0;",

            "gl_FragColor = vec4( vec3( average * 10.0 - 5.0 + pattern() ), color.a );",

        "}"

    ].join("\n")

};




/**
 * @author zz85 / https://github.com/zz85 | https://www.lab4games.net/zz85/blog
 *
 * Edge Detection Shader using Sobel filter
 * Based on http://rastergrid.com/blog/2011/01/frei-chen-edge-detector
 *
 * aspect: vec2 of (1/width, 1/height)
 */

THREE.EdgeShader2 = {

    uniforms: {

        "tDiffuse": { type: "t", value: null },
        "aspect":    { type: "v2", value: new THREE.Vector2( 512, 512 ) },
    },

    vertexShader: [

        "varying vec2 vUv;",

        "void main() {",

            "vUv = uv;",
            "gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",

        "}"

    ].join("\n"),

    fragmentShader: [

        "uniform sampler2D tDiffuse;",
        "varying vec2 vUv;",
        "uniform vec2 aspect;",


        "vec2 texel = vec2(1.0 / aspect.x, 1.0 / aspect.y);",

        "mat3 G[2];",

        "const mat3 g0 = mat3( 1.0, 2.0, 1.0, 0.0, 0.0, 0.0, -1.0, -2.0, -1.0 );",
        "const mat3 g1 = mat3( 1.0, 0.0, -1.0, 2.0, 0.0, -2.0, 1.0, 0.0, -1.0 );",


        "void main(void)",
        "{",
            "mat3 I;",
            "float cnv[2];",
            "vec3 sample;",

            "G[0] = g0;",
            "G[1] = g1;",

            /* fetch the 3x3 neighbourhood and use the RGB vector's length as intensity value */
            "for (float i=0.0; i<3.0; i++)",
            "for (float j=0.0; j<3.0; j++) {",
                "sample = texture2D( tDiffuse, vUv + texel * vec2(i-1.0,j-1.0) ).rgb;",
                "I[int(i)][int(j)] = length(sample);",
            "}",

            /* calculate the convolution values for all the masks */
            "for (int i=0; i<2; i++) {",
                "float dp3 = dot(G[i][0], I[0]) + dot(G[i][1], I[1]) + dot(G[i][2], I[2]);",
                "cnv[i] = dp3 * dp3; ",
            "}",

            "gl_FragColor = vec4(0.5 * sqrt(cnv[0]*cnv[0]+cnv[1]*cnv[1]));",
        "} ",

    ].join("\n")

};




/**
 * @author alteredq / http://alteredqualia.com/
 *
 * Film grain & scanlines shader
 *
 * - ported from HLSL to WebGL / GLSL
 * http://www.truevision3d.com/forums/showcase/staticnoise_colorblackwhite_scanline_shaders-t18698.0.html
 *
 * Screen Space Static Postprocessor
 *
 * Produces an analogue noise overlay similar to a film grain / TV static
 *
 * Original implementation and noise algorithm
 * Pat 'Hawthorne' Shearon
 *
 * Optimized scanlines + noise version with intensity scaling
 * Georg 'Leviathan' Steinrohder
 *
 * This version is provided under a Creative Commons Attribution 3.0 License
 * http://creativecommons.org/licenses/by/3.0/
 */

THREE.FilmShader = {

    uniforms: {

        "tDiffuse":   { type: "t", value: null },
        "time":       { type: "f", value: 0.0 },
        "nIntensity": { type: "f", value: 0.5 },
        "sIntensity": { type: "f", value: 0.05 },
        "sCount":     { type: "f", value: 4096 },
        "grayscale":  { type: "i", value: 1 }

    },

    vertexShader: [

        "varying vec2 vUv;",

        "void main() {",

            "vUv = uv;",
            "gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",

        "}"

    ].join("\n"),

    fragmentShader: [

        // control parameter
        "uniform float time;",

        "uniform bool grayscale;",

        // noise effect intensity value (0 = no effect, 1 = full effect)
        "uniform float nIntensity;",

        // scanlines effect intensity value (0 = no effect, 1 = full effect)
        "uniform float sIntensity;",

        // scanlines effect count value (0 = no effect, 4096 = full effect)
        "uniform float sCount;",

        "uniform sampler2D tDiffuse;",

        "varying vec2 vUv;",

        "void main() {",

            // sample the source
            "vec4 cTextureScreen = texture2D( tDiffuse, vUv );",

            // make some noise
            "float x = vUv.x * vUv.y * time *  1000.0;",
            "x = mod( x, 13.0 ) * mod( x, 123.0 );",
            "float dx = mod( x, 0.01 );",

            // add noise
            "vec3 cResult = cTextureScreen.rgb + cTextureScreen.rgb * clamp( 0.1 + dx * 100.0, 0.0, 1.0 );",

            // get us a sine and cosine
            "vec2 sc = vec2( sin( vUv.y * sCount ), cos( vUv.y * sCount ) );",

            // add scanlines
            "cResult += cTextureScreen.rgb * vec3( sc.x, sc.y, sc.x ) * sIntensity;",

            // interpolate between source and result by intensity
            "cResult = cTextureScreen.rgb + clamp( nIntensity, 0.0,1.0 ) * ( cResult - cTextureScreen.rgb );",

            // convert to grayscale if desired
            "if( grayscale ) {",

                "cResult = vec3( cResult.r * 0.3 + cResult.g * 0.59 + cResult.b * 0.11 );",

            "}",

            "gl_FragColor =  vec4( cResult, cTextureScreen.a );",

        "}"

    ].join("\n")

};



/**
 * @author tapio / http://tapio.github.com/
 *
 * Hue and saturation adjustment
 * https://github.com/evanw/glfx.js
 * hue: -1 to 1 (-1 is 180 degrees in the negative direction, 0 is no change, etc.
 * saturation: -1 to 1 (-1 is solid gray, 0 is no change, and 1 is maximum contrast)
 */

THREE.HueSaturationShader = {

    uniforms: {

        "tDiffuse":   { type: "t", value: null },
        "hue":        { type: "f", value: 0 },
        "saturation": { type: "f", value: 0 }

    },

    vertexShader: [

        "varying vec2 vUv;",

        "void main() {",

            "vUv = uv;",

            "gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",

        "}"

    ].join("\n"),

    fragmentShader: [

        "uniform sampler2D tDiffuse;",
        "uniform float hue;",
        "uniform float saturation;",

        "varying vec2 vUv;",

        "void main() {",

            "gl_FragColor = texture2D( tDiffuse, vUv );",

            // hue
            "float angle = hue * 3.14159265;",
            "float s = sin(angle), c = cos(angle);",
            "vec3 weights = (vec3(2.0 * c, -sqrt(3.0) * s - c, sqrt(3.0) * s - c) + 1.0) / 3.0;",
            "float len = length(gl_FragColor.rgb);",
            "gl_FragColor.rgb = vec3(",
                "dot(gl_FragColor.rgb, weights.xyz),",
                "dot(gl_FragColor.rgb, weights.zxy),",
                "dot(gl_FragColor.rgb, weights.yzx)",
            ");",

            // saturation
            "float average = (gl_FragColor.r + gl_FragColor.g + gl_FragColor.b) / 3.0;",
            "if (saturation > 0.0) {",
                "gl_FragColor.rgb += (average - gl_FragColor.rgb) * (1.0 - 1.0 / (1.001 - saturation));",
            "} else {",
                "gl_FragColor.rgb += (average - gl_FragColor.rgb) * (-saturation);",
            "}",

        "}"

    ].join("\n")

};



/**
 * @author felixturner / http://airtight.cc/
 *
 * Mirror Shader
 * Copies half the input to the other half
 *
 * side: side of input to mirror (0 = left, 1 = right, 2 = top, 3 = bottom)
 */

THREE.MirrorShader = {

    uniforms: {

        "tDiffuse": { type: "t", value: null },
        "side":     { type: "i", value: 1 }

    },

    vertexShader: [

        "varying vec2 vUv;",

        "void main() {",

            "vUv = uv;",
            "gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",

        "}"

    ].join("\n"),

    fragmentShader: [

        "uniform sampler2D tDiffuse;",
        "uniform int side;",

        "varying vec2 vUv;",

        "void main() {",

            "vec2 p = vUv;",
            "if (side == 0){",
                "if (p.x > 0.5) p.x = 1.0 - p.x;",
            "}else if (side == 1){",
                "if (p.x < 0.5) p.x = 1.0 - p.x;",
            "}else if (side == 2){",
                "if (p.y < 0.5) p.y = 1.0 - p.y;",
            "}else if (side == 3){",
                "if (p.y > 0.5) p.y = 1.0 - p.y;",
            "} ",
            "vec4 color = texture2D(tDiffuse, p);",
            "gl_FragColor = color;",

        "}"

    ].join("\n")

};



/**
 * @author felixturner / http://airtight.cc/
 *
 * RGB Shift Shader
 * Shifts red and blue channels from center in opposite directions
 * Ported from http://kriss.cx/tom/2009/05/rgb-shift/
 * by Tom Butterworth / http://kriss.cx/tom/
 *
 * amount: shift distance (1 is width of input)
 * angle: shift angle in radians
 */

THREE.RGBShiftShader = {

    uniforms: {

        "tDiffuse": { type: "t", value: null },
        "amount":   { type: "f", value: 0.005 },
        "angle":    { type: "f", value: 0.0 }

    },

    vertexShader: [

        "varying vec2 vUv;",

        "void main() {",

            "vUv = uv;",
            "gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",

        "}"

    ].join("\n"),

    fragmentShader: [

        "uniform sampler2D tDiffuse;",
        "uniform float amount;",
        "uniform float angle;",

        "varying vec2 vUv;",

        "void main() {",

            "vec2 offset = amount * vec2( cos(angle), sin(angle));",
            "vec4 cr = texture2D(tDiffuse, vUv + offset);",
            "vec4 cga = texture2D(tDiffuse, vUv);",
            "vec4 cb = texture2D(tDiffuse, vUv - offset);",
            "gl_FragColor = vec4(cr.r, cga.g, cb.b, cga.a);",

        "}"

    ].join("\n")

};



/**
 * @author alteredq / http://alteredqualia.com/
 *
 * Simple fake tilt-shift effect, modulating two pass Gaussian blur (see above) by vertical position
 *
 * - 9 samples per pass
 * - standard deviation 2.7
 * - "h" and "v" parameters should be set to "1 / width" and "1 / height"
 * - "r" parameter control where "focused" horizontal line lies
 */

THREE.VerticalTiltShiftShader = {

    uniforms: {

        "tDiffuse": { type: "t", value: null },
        "v":        { type: "f", value: 1.0 / 512.0 },
        "r":        { type: "f", value: 0.35 }

    },

    vertexShader: [

        "varying vec2 vUv;",

        "void main() {",

            "vUv = uv;",
            "gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",

        "}"

    ].join("\n"),

    fragmentShader: [

        "uniform sampler2D tDiffuse;",
        "uniform float v;",
        "uniform float r;",

        "varying vec2 vUv;",

        "void main() {",

            "vec4 sum = vec4( 0.0 );",

            "float vv = v * abs( r - vUv.y );",

            "sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y - 4.0 * vv ) ) * 0.051;",
            "sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y - 3.0 * vv ) ) * 0.0918;",
            "sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y - 2.0 * vv ) ) * 0.12245;",
            "sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y - 1.0 * vv ) ) * 0.1531;",
            "sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y ) ) * 0.1633;",
            "sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y + 1.0 * vv ) ) * 0.1531;",
            "sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y + 2.0 * vv ) ) * 0.12245;",
            "sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y + 3.0 * vv ) ) * 0.0918;",
            "sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y + 4.0 * vv ) ) * 0.051;",

            "gl_FragColor = sum;",

        "}"

    ].join("\n")

};



/**
 * @author alteredq / http://alteredqualia.com/
 *
 * Vignette shader
 * based on PaintEffect postprocess from ro.me
 * http://code.google.com/p/3-dreams-of-black/source/browse/deploy/js/effects/PaintEffect.js
 */

THREE.VignetteShader = {

    uniforms: {

        "tDiffuse": { type: "t", value: null },
        "offset":   { type: "f", value: 1.0 },
        "darkness": { type: "f", value: 1.0 }

    },

    vertexShader: [

        "varying vec2 vUv;",

        "void main() {",

            "vUv = uv;",
            "gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",

        "}"

    ].join("\n"),

    fragmentShader: [

        "uniform float offset;",
        "uniform float darkness;",

        "uniform sampler2D tDiffuse;",

        "varying vec2 vUv;",

        "void main() {",

            // Eskil's vignette

            "vec4 texel = texture2D( tDiffuse, vUv );",
            "vec2 uv = ( vUv - vec2( 0.5 ) ) * vec2( offset );",
            "gl_FragColor = vec4( mix( texel.rgb, vec3( 1.0 - darkness ), dot( uv, uv ) ), texel.a );",

            /*
            // alternative version from glfx.js
            // this one makes more "dusty" look (as opposed to "burned")

            "vec4 color = texture2D( tDiffuse, vUv );",
            "float dist = distance( vUv, vec2( 0.5 ) );",
            "color.rgb *= smoothstep( 0.8, offset * 0.799, dist *( darkness + offset ) );",
            "gl_FragColor = color;",
            */

        "}"

    ].join("\n")

};

var ImprovedNoise = function () {

    var p = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,
         23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,
         174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,
         133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,
         89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,
         202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,
         248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,
         178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,
         14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,
         93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180];

    for (var i=0; i < 256 ; i++) {

        p[256+i] = p[i];

    }

    function fade(t) {

        return t * t * t * (t * (t * 6 - 15) + 10);

    }

    function lerp(t, a, b) {

        return a + t * (b - a);

    }

    function grad(hash, x, y, z) {

        var h = hash & 15;
        var u = h < 8 ? x : y, v = h < 4 ? y : h == 12 || h == 14 ? x : z;
        return ((h&1) == 0 ? u : -u) + ((h&2) == 0 ? v : -v);

    }

    return {

        noise: function (x, y, z) {

            var floorX = ~~x, floorY = ~~y, floorZ = ~~z;

            var X = floorX & 255, Y = floorY & 255, Z = floorZ & 255;

            x -= floorX;
            y -= floorY;
            z -= floorZ;

            var xMinus1 = x -1, yMinus1 = y - 1, zMinus1 = z - 1;

            var u = fade(x), v = fade(y), w = fade(z);

            var A = p[X]+Y, AA = p[A]+Z, AB = p[A+1]+Z, B = p[X+1]+Y, BA = p[B]+Z, BB = p[B+1]+Z;

            return lerp(w, lerp(v, lerp(u, grad(p[AA], x, y, z),
                            grad(p[BA], xMinus1, y, z)),
                        lerp(u, grad(p[AB], x, yMinus1, z),
                            grad(p[BB], xMinus1, yMinus1, z))),
                    lerp(v, lerp(u, grad(p[AA+1], x, y, zMinus1),
                            grad(p[BA+1], xMinus1, y, z-1)),
                        lerp(u, grad(p[AB+1], x, yMinus1, zMinus1),
                            grad(p[BB+1], xMinus1, yMinus1, zMinus1))));

        }
    }
}

var PersonaBadTV = function() {
    var camera, scene, renderer;
    var _canvas ;
    var composer;
    var renderPass, copyPass;
    var shaderTime = 0;
    var w , h ;
    var gui;
    var renderW;
    var renderH;
    var resolution;
    var inputImage;
    var filters; 
    var passes;
    var plane;
    var planeMaterial;
    var sourceSize; 

    var loadedTexture;

    var imgTexture = new THREE.TextureLoader();
        imgTexture.crossOrigin = "";

    var has_dimensions = false;

    var snoise = {}

    var defaults = {
        "image": "",
        "image_width":"",
        "image_height":"",

        "automate": true,
        "interactive": true,
        "filters": {
            "badtv":{
                "displayName": "Bad TV",
                "on": true,
                "params": {

                    "distortion":{
                        "displayName":"Thick Distortion",
                        "interactive": true,
                        "value": 3.0,
                        "min":0.1,
                        "max":10,
                        "step":0.1,
                        "noisePosn": 1,
                        "randMin": 2.8,
                        "randMax": 3.2,
                        "randRange":"low"
                    },

                    "distortion2":{
                        "value": 1.0,
                        "min":0.1,
                        "max":10,
                        "step":0.1,
                        "displayName":"Fine Distortion",
                        "noisePosn": 20,
                        "randMin": 1.0,
                        "randMax": 5.0,
                        "automate": true
                    },

                    "speed":{
                        "displayName":"Distortion Speed",
                        "value": 0.1,
                        "min":0.0,
                        "max":0.3,
                        "step":0.01,
                        "noisePosn": 40,
                        "randMin": 0.0,
                        "randMax": 0.1,
                        "randRange":"low"
                    },

                    "rollSpeed":{
                        "displayName":"Roll Speed",
                        "value": 0.05,
                        "min":0.0,
                        "max":0.2,
                        "step":0.01,
                        "noisePosn": 50,
                        "randMin": 0.0,
                        "randMax": 0.6,
                        "randRange":"low"
                    }

                }
            },

            "rgb": {
                "displayName": "RGB Shift",
                "on": true,
                "params": {

                    "amount":{
                        "value": 0.005,
                        "min":0,
                        "max":0.1,
                        "step":0.001,
                        "displayName":"Amount",
                        "interactive": true,
                        "noisePosn": 60,
                        "randMin": 0.0,
                        "randMax": 0.025,
                        "randRange":"low"
                    },

                    "angle":{
                        "value": 0,
                        "min":0,
                        "max":6.28,
                        "step":0.01,
                        "displayName":"Angle",
                        "noisePosn": 80,
                        "randMin": 0.0,
                        "randMax": 6.28,
                        "automate": true
                    }

                }
            },

            "film": {
                "displayName": "Scanlines",
                "on": true,
                "params": {

                    "sCount":{
                        "displayName":"Amount",
                        "value": 800,
                        "min":400,
                        "max":1000,
                        "step":1,
                        "noisePosn": 90,
                        "randMin": 650,
                        "randMax": 1000,
                        "randRange":"high"
                    },
                    "sIntensity":{
                        "displayName":"Strength",
                        "value": 0.95,
                        "min":0.0,
                        "max":2,
                        "step":0.01
                    },
                    "nIntensity":{
                        "displayName":"Noise",
                        "value": 0.28,
                        "min":0.0,
                        "max":2,
                        "step":0.01
                    }

                }
            }
        }
    }

    var isPowerOfTwo = function(x) {
        return (x & (x - 1)) == 0;
    };

    var nextHighestPowerOfTwo = function(x) {
        --x;
        for (var i = 1; i < 32; i <<= 1) {
            x = x | x >> i;
        }
        return Math.min(x + 1, 2048);
    };


    function init( { canvas, img } ) {
        userImg = img;
        if ( canvas !== undefined ){
            _canvas = canvas ;
            w = _canvas.clientWidth ;
            h = _canvas.clientHeight ;
        } else {
            return ;
        }
        // canvas.width = userImg.width;
        // canvas.height = userImg.height;
        snoise = new ImprovedNoise();

        filters = defaults.filters ;


        camera = new THREE.PerspectiveCamera(75, userImg.width/userImg.height, 1, 3000);
        camera.position.z = 66;
        scene = new THREE.Scene();

        planeMaterial = new THREE.MeshBasicMaterial();
        var planeGeometry = new THREE.PlaneGeometry( 100, 100,1,1 );
        plane = new THREE.Mesh( planeGeometry, planeMaterial );

        renderer = new THREE.CanvasRenderer({
            canvas : canvas
        });

        updateImage(defaults.image );

        scene.add( plane );
        renderPass = new THREE.RenderPass( scene, camera );
        copyPass = new THREE.ShaderPass( THREE.CopyShader );

        passes = {};
        passes.badtv = new THREE.ShaderPass( THREE.BadTVShader );
        passes.rgb = new THREE.ShaderPass( THREE.RGBShiftShader );
        passes.film = new THREE.ShaderPass( THREE.FilmShader );

        passes.film.uniforms.grayscale.value = 0;

        initFilters();

        onResize(true);

    }

    function onTouchMove(evt){

        if (!defaults.interactive) return;

        var mx = Math.abs((evt.touches[0].clientX / window.innerWidth) - 0.5)*2;
        var my = Math.abs((evt.touches[0].clientY / window.innerHeight) - 0.5)*2;

        var param = filters.rgb.params.amount;
        param.value = ATUtil.lerp(mx,param.min,param.max);

        param = filters.badtv.params.distortion;
        param.value = ATUtil.lerp(my,param.min,param.max);

        onParamsChange();
    }


    function onMouseMove(evt){

        if (!defaults.interactive) return;

        var mx = Math.abs((evt.clientX / window.innerWidth) - 0.5)*2;
        var my = Math.abs((evt.clientY / window.innerHeight) - 0.5)*2;

        var param = filters.rgb.params.amount;
        param.value = ATUtil.lerp(mx,param.min,param.max);

        param = filters.badtv.params.distortion;
        param.value = ATUtil.lerp(my,param.min,param.max);

        onParamsChange();

    }

    function updateImage(url){

        var canvas;
        var ctx;
        var base_texture;
        sourceSize = new THREE.Vector2(userImg.width, userImg.height);
        canvas = new Canvas(500, 500);
        canvas.width = userImg.width ;
        canvas.height = userImg.height;
        ctx = canvas.getContext("2d");
        ctx.drawImage(userImg, 0, 0, userImg.width, userImg.height ,0,0,userImg.width,userImg.height);
        loadedTexture = new THREE.Texture(canvas);
        loadedTexture.minFilter = THREE.LinearFilter;
        loadedTexture.magFilter = THREE.LinearFilter;
        loadedTexture.needsUpdate = true;
        planeMaterial.map = loadedTexture;
        planeMaterial.needsUpdate = true;
        onResize(true);
    }

    function animate() {
        shaderTime += 0.1;
        passes.badtv.uniforms.time.value =  shaderTime;
        passes.film.uniforms.time.value =  shaderTime;


        onResize();
        /*
        if (defaults.automate){
            $.each( filters, function( i, filter ) {
                $.each( filter.params, function( j, param ) {
                    if (param.automate){
                        var val = (snoise.noise(shaderTime/10,param.noisePosn,0) / 2) + 0.5;
                        param.value = ATUtil.lerp(val,param.randMin,param.randMax);
                    }
                });
            });

            onParamsChange();

        }
        */
        
        composer.render( 0.1);


    }

    var canvasWidth = 0;
    var canvasHeight = 0;

    function onResize(force_update){
        var current_res = 1;
        renderW = userImg.width;
        renderH = userImg.height;

        if (renderW > 0 && ( force_update == true || renderW !=canvasWidth || renderH !=canvasHeight || resolution != current_res)){

            canvasHeight = renderH;
            canvasWidth = renderW;
            resolution = current_res;

            //camera.aspect = renderW / renderH;
            //camera.updateProjectionMatrix();
            //renderer.setSize( renderW,renderH);
            if (composer) composer.setSize(renderW,renderH);
            if (sourceSize){
                var srcAspect = sourceSize.x/sourceSize.y;

                if ( camera.aspect > srcAspect) {

                    plane.scale.x = (camera.aspect) + .04;
                    plane.scale.y = (1* (sourceSize.y/ sourceSize.x) )  * (camera.aspect) + .04;

                } else {
                    plane.scale.x = srcAspect+ .04;
                    plane.scale.y = 1+ .04 ;
                }

            }
        }


    }


    function initFilters(){

        var folder;
        
        for ( let key in filters){
            let filter = filters[key];
            for ( let key2 in filter.params ){
                let param = filter.params[key2];
                param.noisePosn = Math.random() * 9999;
            }
        }
 

        onToggleShaders();
        onParamsChange();
        animate();
    }

    function onParamsChange() {
        for ( let key in filters){
            let filter = filters[key];
            for ( let key2 in filter.params ){
                let param = filter.params[key2];
                passes[key].uniforms[key2].value = param.value;
            }
        }

    }

    function onToggleShaders(){

        composer = new THREE.EffectComposer( renderer);
        composer.addPass( renderPass );

        for ( let key in filters){
            let filter = filters[key];
            if (filter.on){
                composer.addPass(passes[key]);
            }
        }

        

        composer.addPass( copyPass );
        copyPass.renderToScreen = true;
        composer.setSize(renderW ,renderH );
    }
    
    return {
        animate: animate,
        init:init,
        updateImage:updateImage,
        initFilters: initFilters,
        automate: function() { return automate;}
    };

}();

module.exports = PersonaBadTV;