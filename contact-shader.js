/*
MIT + Commons Clause License Condition v1.0
Copyright (c) 2026 David Haz

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, and distribute the Software as part of an
application, website, or product, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
Commons Clause Restriction: You may use this Software, including for any
commercial purpose, so long as you do not sell, sublicense, or redistribute
the components themselves-whether alone, in a bundle, or as a ported version.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
// Liquid Chrome adapted from React Bits by David Haz: https://github.com/DavidHDev/react-bits
(() => {
const vertexSource = `
    attribute vec2 a_position;
    void main() {
      gl_Position = vec4(a_position, 0, 1);
    }
  `;
const fragmentSource = `
      precision highp float;
      uniform float uTime;
      uniform vec3 uResolution;
      uniform vec3 uBaseColor;
      uniform float uAmplitude;
      uniform float uFrequencyX;
      uniform float uFrequencyY;
      uniform vec2 uMouse;
      

      vec4 renderImage(vec2 uvCoord) {
          vec2 fragCoord = uvCoord * uResolution.xy;
          vec2 uv = (2.0 * fragCoord - uResolution.xy) / min(uResolution.x, uResolution.y);

          for (float i = 1.0; i < 10.0; i++){
              uv.x += uAmplitude / i * cos(i * uFrequencyX * uv.y + uTime + uMouse.x * 3.14159);
              uv.y += uAmplitude / i * cos(i * uFrequencyY * uv.x + uTime + uMouse.y * 3.14159);
          }

          vec2 diff = (uvCoord - uMouse);
          float dist = length(diff);
          float falloff = exp(-dist * 20.0);
          float ripple = sin(10.0 * dist - uTime * 2.0) * 0.03;
          uv += (diff / (dist + 0.0001)) * ripple * falloff;

          vec3 color = uBaseColor / abs(sin(uTime - uv.y - uv.x));
          return vec4(color, 1.0);
      }

      void main() {
          vec4 col = vec4(0.0);
          int samples = 0;
          for (int i = -1; i <= 1; i++){
              for (int j = -1; j <= 1; j++){
                  vec2 offset = vec2(float(i), float(j)) * (1.0 / min(uResolution.x, uResolution.y));
                  col += renderImage(gl_FragCoord.xy / uResolution.xy + offset);
                  samples++;
              }
          }
          gl_FragColor = col / float(samples);
      }
    `;
let activeCanvas = null, dispose = () => {};
function mount(canvas) {
 const button = document.querySelector('#shader-toggle');
 const gl = canvas.getContext('webgl', {alpha:false, antialias:false, powerPreference:'low-power'});
 if (!gl) return () => {};
 let program, buffer, frame=0, elapsed=0, previous=0, visible=false, paused=false, lost=false;
 const shaders=[];
 try {
  for (const [type,source] of [[gl.VERTEX_SHADER,vertexSource],[gl.FRAGMENT_SHADER,fragmentSource]]) {
   const shader=gl.createShader(type); shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);
   if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw Error('Shader unavailable');
  }
  program=gl.createProgram();shaders.forEach(s=>gl.attachShader(program,s));gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Shader unavailable');
  gl.useProgram(program);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  const position=gl.getAttribLocation(program,'a_position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
 } catch {
  shaders.forEach(s=>gl.deleteShader(s));if(program)gl.deleteProgram(program);if(buffer)gl.deleteBuffer(buffer);return ()=>{};
 }
 const uniforms=Object.fromEntries(['uResolution','uTime','uBaseColor','uAmplitude','uFrequencyX','uFrequencyY','uMouse'].map(n=>[n,gl.getUniformLocation(program,n)]));
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 function draw(){
  if(lost)return;
  const ratio=Math.min(window.devicePixelRatio||1,1.5);
  const width=Math.max(1,Math.round(canvas.clientWidth*ratio)),height=Math.max(1,Math.round(canvas.clientHeight*ratio));
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;gl.viewport(0,0,width,height);}
  gl.useProgram(program);gl.uniform3f(uniforms.uResolution,width,height,width/height);gl.uniform1f(uniforms.uTime,(elapsed+3)*.7);
  gl.uniform3f(uniforms.uBaseColor,.1,.1,.1);gl.uniform1f(uniforms.uAmplitude,.3);gl.uniform1f(uniforms.uFrequencyX,3);gl.uniform1f(uniforms.uFrequencyY,3);gl.uniform2f(uniforms.uMouse,0,0);
  gl.drawArrays(gl.TRIANGLES,0,6);
 }
 function tick(time){frame=0;if(previous)elapsed+=Math.min((time-previous)/1000,.1);previous=time;draw();frame=requestAnimationFrame(tick);}
 function sync(){
  cancelAnimationFrame(frame);frame=0;previous=0;
  const stopped=paused||reduced.matches;
  button.hidden=false;button.textContent=stopped?'MOTION PAUSED':'PAUSE MOTION';button.setAttribute('aria-pressed',String(stopped));button.disabled=reduced.matches;
  if(!lost){draw();if(visible&&!document.hidden&&!stopped)frame=requestAnimationFrame(tick);}
 }
 function toggle(){paused=!paused;sync();}
 function contextLost(event){event.preventDefault();lost=true;cancelAnimationFrame(frame);canvas.style.opacity='0';button.hidden=true;}
 function contextRestored(){activeCanvas=null;refresh();}
 const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();});observer.observe(canvas);
 const resize=new ResizeObserver(draw);resize.observe(canvas);
 button.addEventListener('click',toggle);document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',sync);
 canvas.addEventListener('webglcontextlost',contextLost);canvas.addEventListener('webglcontextrestored',contextRestored);canvas.style.opacity='1';sync();
 return ()=>{cancelAnimationFrame(frame);observer.disconnect();resize.disconnect();button.removeEventListener('click',toggle);document.removeEventListener('visibilitychange',sync);reduced.removeEventListener('change',sync);canvas.removeEventListener('webglcontextlost',contextLost);canvas.removeEventListener('webglcontextrestored',contextRestored);shaders.forEach(s=>gl.deleteShader(s));gl.deleteBuffer(buffer);gl.deleteProgram(program);};
}
function refresh(){const canvas=document.querySelector('#contact-shader');if(canvas===activeCanvas)return;dispose();activeCanvas=canvas;dispose=canvas?mount(canvas):()=>{};}
const observer=new MutationObserver(refresh);observer.observe(document.querySelector('#app'),{childList:true});refresh();
})();
