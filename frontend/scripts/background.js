/**
 * background.js
 * Vanilla Three.js implementation of the Interactive Nebula Shader.
 */

class NebulaBackground {
    constructor() {
        this.container = document.createElement('div');
        this.container.id = 'nebula-bg';
        this.container.style.position = 'fixed';
        this.container.style.top = '0';
        this.container.style.left = '0';
        this.container.style.width = '100vw';
        this.container.style.height = '100vh';
        this.container.style.zIndex = '-1';
        this.container.style.backgroundColor = '#080808';
        document.body.appendChild(this.container);

        this.init();
    }

    init() {
        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.container.appendChild(this.renderer.domElement);

        // Scene & Camera
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.clock = new THREE.Clock();

        // Shaders
        const vertexShader = `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1.0);
            }
        `;

        const fragmentShader = `
            precision mediump float;
            uniform vec2 iResolution;
            uniform float iTime;
            uniform vec2 iMouse;
            uniform bool hasActiveReminders;
            uniform bool hasUpcomingReminders;
            uniform bool disableCenterDimming;
            varying vec2 vUv;

            #define t iTime
            mat2 m(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
            float map(vec3 p){
                p.xz *= m(t*0.4);
                p.xy *= m(t*0.3);
                vec3 q = p*2. + t;
                return length(p + vec3(sin(t*0.7))) * log(length(p)+1.0)
                     + sin(q.x + sin(q.z + sin(q.y))) * 0.5 - 1.0;
            }

            void mainImage(out vec4 O, in vec2 fragCoord) {
                vec2 uv = fragCoord / min(iResolution.x, iResolution.y) - vec2(.9, .5);
                uv.x += .4;
                vec3 col = vec3(0.0);
                float d = 2.5;

                // Ray-march
                for (int i = 0; i <= 5; i++) {
                    vec3 p = vec3(0,0,5.) + normalize(vec3(uv, -1.)) * d;
                    float rz = map(p);
                    float f  = clamp((rz - map(p + 0.1)) * 0.5, -0.1, 1.0);

                    // Palettes (Default to the standard one for this app)
                    vec3 base = vec3(0.1,0.3,0.4) + vec3(5.0,2.5,3.0)*f;

                    col = col * base + smoothstep(2.5, 0.0, rz) * 0.7 * base;
                    d += min(rz, 1.0);
                }

                // Center dimming
                float dist   = distance(fragCoord, iResolution*0.5);
                float radius = min(iResolution.x, iResolution.y) * 0.5;
                float dim    = disableCenterDimming
                             ? 1.0
                             : smoothstep(radius*0.3, radius*0.5, dist);

                O = vec4(col, 1.0);
                if (!disableCenterDimming) {
                    O.rgb = mix(O.rgb * 0.3, O.rgb, dim);
                }
            }

            void main() {
                mainImage(gl_FragColor, vUv * iResolution);
            }
        `;

        this.uniforms = {
            iTime: { value: 0 },
            iResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
            iMouse: { value: new THREE.Vector2(0, 0) },
            hasActiveReminders: { value: false },
            hasUpcomingReminders: { value: false },
            disableCenterDimming: { value: false },
        };

        const material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: this.uniforms
        });

        const geometry = new THREE.PlaneGeometry(2, 2);
        const mesh = new THREE.Mesh(geometry, material);
        this.scene.add(mesh);

        // Events
        window.addEventListener('resize', () => this.onResize());
        window.addEventListener('mousemove', (e) => this.onMouseMove(e));

        // Start loop
        this.animate();
    }

    onResize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.renderer.setSize(w, h);
        this.uniforms.iResolution.value.set(w, h);
    }

    onMouseMove(e) {
        this.uniforms.iMouse.value.set(e.clientX, window.innerHeight - e.clientY);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.uniforms.iTime.value = this.clock.getElapsedTime();
        this.renderer.render(this.scene, this.camera);
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    window.nebulaBg = new NebulaBackground();
});
