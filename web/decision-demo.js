// Illustrative feature proposals for the analyzed library; never inserted into the live queue.
export const decisionDemoProject = { id: "xarts", name: "Xarts", kind: "chart-library" };
export const decisionDemos = [
  {
    "id": "xarts-formatting",
    "project": "xarts",
    "title": "Cifras listas para presentar.",
    "question": "¿Damos control del formato numérico en Xarts?",
    "why": "Un waterfall financiero necesita decimales, moneda y signos legibles sin cambiar los valores originales.",
    "recommendation": "Implementar numberFormat por rol: precisión configurable y signos bien colocados en etiquetas, ejes y tooltips.",
    "alternative": "Mantener el formato automático y los ajustes de datos que hoy necesita el consumidor.",
    "benefit": "Presentaciones consistentes sin redondear los datos para arreglar una etiqueta.",
    "boundary": "El formato cambia la presentación, nunca el dato ni la geometría del gráfico.",
    "evidence": "Xarts Chat · docs/FINDINGS.md, F5; docs/INTEGRATION.md, incidente 3. Hallazgo documentado; verificar contra la versión candidata.",
    "validation": "Mismos valores antes y después; casos de moneda, negativos, ceros y decimales en waterfall, ejes y tooltips.",
    "steps": [
      "Dato intacto",
      "Formato por rol",
      "Cifras legibles"
    ],
    "scene": "A beautiful isometric financial chart design exhibit, NOT an office or maintenance workshop. Three stages: transparent raw-data beads in a glass tray; three precision dial controls for decimal precision, currency and negative signs; a clean upright waterfall chart panel with cobalt positive bars, orange negative bars, turquoise total, spacious blank label plaques aligned neatly next to each bar. Clearly show chart typography formatting as the subject. No readable numbers or letters."
  },
  {
    "id": "xarts-layout",
    "project": "xarts",
    "title": "Cada etiqueta encuentra su espacio.",
    "question": "¿Añadimos un layout adaptable a los gráficos?",
    "why": "Títulos largos, leyendas y etiquetas compiten por el mismo espacio. El informe del chat documenta recortes y solapes en las demos.",
    "recommendation": "Explorar márgenes medidos y ajuste de línea para adaptar etiquetas a varios tamaños, manteniendo un tamaño de texto legible.",
    "alternative": "Corregir cada plantilla afectada con márgenes específicos, sin crear una política adaptable común.",
    "benefit": "El mismo gráfico se entiende en el chat, en una tarjeta estrecha y en una presentación.",
    "boundary": "No ocultar etiquetas ni reducir el texto silenciosamente. Si no cabe, explicar qué necesita más espacio.",
    "evidence": "Xarts Chat · docs/FINDINGS.md, F6: informe histórico de 27 formas con recortes y 24 con solapes. No es una medición nueva.",
    "validation": "Repetir npm run quality y probar textos largos en varios tamaños. Comparar recortes y solapes con la misma batería.",
    "steps": [
      "Medir texto",
      "Ajustar espacio",
      "Leer completo"
    ],
    "scene": "An isometric chart responsive-layout infographic, NOT an office. Three chart panels on a pale terrazzo platform: at left a small frame with cobalt bars and abstract blank label strips visibly colliding and extending outside an orange boundary; center a precision measuring ruler and expanding turquoise margins around a bar-chart frame; right a wide and a narrow chart panel both with generous neat blank label strips entirely inside their frames. Use arrows to show layout adaptation. No readable text or numeric values."
  },
  {
    "id": "xarts-accessibility",
    "project": "xarts",
    "title": "La marca se reconoce. El gráfico se lee.",
    "question": "¿Ofrecemos temas accesibles para Xarts?",
    "why": "El roadmap distingue entre separar los colores de las series y conseguir suficiente contraste en el texto. Son problemas diferentes.",
    "recommendation": "Diseñar variantes de tema con texto de mayor contraste y señales adicionales, como patrones o marcadores, cuando el color no baste.",
    "alternative": "Mantener la paleta actual y documentar sus límites de uso.",
    "benefit": "Gráficos más legibles para más personas, conservando una identidad visual reconocible.",
    "boundary": "Cualquier cambio de paleta necesita revisión visual. No declarar accesibilidad completa solo por superar una prueba de contraste.",
    "evidence": "Xarts · docs/ROADMAP.md, revisa-paleta; docs/VENDIBLE-CHECKLIST.md, contraste de texto. Deuda documentada, pendiente de revalidación.",
    "validation": "Medir contraste, simular deficiencias de visión del color y revisar los gráficos representativos de cada tema.",
    "steps": [
      "Identidad visual",
      "Contraste y patrones",
      "Lectura clara"
    ],
    "scene": "An isometric accessible chart theme design exhibit, NOT an office. Three connected stations: beautiful cobalt turquoise orange material swatches; a magnifying glass over a high-contrast charcoal label strip against ivory and tactile striped, dotted and solid series samples; a polished grouped-bar chart and line-chart display using both distinct colors and dot square triangle markers, blank dark label plaques. Communicate readable chart themes beyond color alone. No text or numeric values."
  },
  {
    "id": "xarts-preflight",
    "project": "xarts",
    "title": "Detectar el error antes de dibujarlo.",
    "question": "¿Añadimos una validación previa para agentes?",
    "why": "Xarts ya describe gráficos con --describe. Su roadmap plantea comprobar la especificación sin tener que renderizar y conectar mejor ese contrato con agentes.",
    "recommendation": "Explorar un modo --check que valide roles y opciones y devuelva errores estructurados con sugerencias de corrección.",
    "alternative": "Seguir combinando --describe con los errores que aparecen durante el render.",
    "benefit": "Menos intentos fallidos al construir gráficos desde el chat o una integración.",
    "boundary": "Reutilizar las reglas reales del render. Superar --check no demuestra que el resultado visual sea correcto.",
    "evidence": "Xarts · docs/ROADMAP.md, W2: --check, espejo MCP de --describe y comprobación columns ↔ roles. render-cli/cli.ts ya expone --describe.",
    "validation": "Specs válidos e inválidos con roles y estilos conocidos; comprobar que la validación no escribe imágenes y coincide con el contrato del render.",
    "steps": [
      "Spec del gráfico",
      "Validar contrato",
      "Render preparado"
    ],
    "scene": "An isometric chart specification preflight infographic, NOT a deployment pipeline. Three linked objects: a translucent structured-data sheet with abstract bracket-shaped geometry and one orange mismatched field; a compact glass inspection lens aligning geometric field tokens into matching sockets; a pristine cobalt and turquoise chart panel with bars and a line, ready for rendering. Show a small return arrow from the inspection lens to the incorrect field. No letters, code text or numbers."
  }
];
export function mountDecisionDemo(root,{onHistory}={}){
 const viewToken={};root.improvementView=viewToken;let last='',selected,items=[],notice='',busy=false;const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 async function refresh(){try{const r=await fetch('/api/improvements',{cache:'no-store'});if(!r.ok)throw Error('No se pudieron leer las propuestas reales.');const data=await r.json();if(data.projectId!=='xarts')throw Error('Proyecto incorrecto');items=data.items;const next=JSON.stringify(items);if(next!==last){last=next;render();}}catch(e){notice=e.message;render();}}
 async function act(d,execute){busy=true;root.improvementsBusy=true;notice=execute?'Enviando la tarea autorizada a Devin…':'Guardando el encargo de planificación…';render();try{
  const session=await fetch('/api/owner-session',{cache:'no-store'});if(!session.ok)throw Error('Sesión de propietario no disponible');const {token}=await session.json();
  const body=execute?{proposalId:d.proposalId,revision:d.revision,taskHash:d.execution.taskHash}:{proposalId:d.proposalId,revision:d.revision,action:'approve_plan',feedback:''};
  const response=await fetch(execute?'/api/improvements/execute':'/api/owner-decisions',{method:'POST',headers:{'Content-Type':'application/json','X-Owner-Token':token},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw Error(result.error??'No se pudo registrar la acción');
  notice=execute?(result.kind==='created'?'Devin ha recibido la tarea. La entrega queda pendiente de QA.':'Consulta el estado registrado de la ejecución.'):'Planificación encargada y guardada. Aún no autoriza ejecución ni entrega.';
 }catch(e){notice=e.message;}finally{busy=false;root.improvementsBusy=false;last='';await refresh();}}
 function render(){root.replaceChildren();root.className='decision-workspace decision-demo';
 const rail=el('aside',undefined,'decision-tray');rail.append(el('span','PROYECTO ANALIZADO · XARTS','decision-kicker'),el('h3','Mejoras para tu librería.','demo-heading'),el('p','Propuestas reales con evidencia y acciones registradas.','decision-empty'));
 const queue=el('nav',undefined,'decision-queue');queue.setAttribute('aria-label','Mejoras de Xarts');
 const d=items.find(d=>d.proposalId===selected)??items[0];selected=d?.proposalId;
 items.forEach((item,i)=>{const b=el('button',undefined,'decision-envelope');b.setAttribute('aria-pressed',String(item.proposalId===selected));const image=el('img');image.src=`/assets/decisions/${item.id}.png`;image.alt='';b.append(image,el('small',`0${i+1} / Xarts`),el('strong',item.title));b.onclick=()=>{selected=item.proposalId;notice='';render();};queue.append(b);});rail.append(queue,el('p','Las acciones se registran de verdad. Las imágenes ilustran la mejora propuesta; no son evidencia de que esté entregada.','decision-consent'));
 if(onHistory){const history=el('button','Historial y pull requests');history.onclick=onHistory;rail.append(history);}
 const sheet=el('article',undefined,'decision-sheet');if(d){sheet.append(el('span','XARTS / MEJORA PROPUESTA','decision-kicker'),el('h3',d.title));const figure=el('figure',undefined,'demo-infographic'),a=el('a');a.href=`/assets/decisions/${d.id}.png`;a.target='_blank';a.rel='noopener';const image=el('img');image.src=a.href;image.alt=`Propuesta: ${d.steps.join(' → ')}`;a.append(image);figure.append(a);const caption=el('figcaption');d.steps.forEach((step,i)=>caption.append(el('span',`0${i+1} ${step}`)));figure.append(caption);sheet.append(figure,el('h4',d.question),el('p',d.why,'decision-intro'));
 const rec=el('section',undefined,'decision-recommendation');rec.append(el('small','RECOMENDACIÓN'),el('p',d.recommendation));sheet.append(rec);
 const detail=el('details',undefined,'decision-evidence');detail.append(el('summary','Evidencia, alternativa y prueba de aceptación'),el('p',d.evidence),el('p',d.validation),el('p',`Alternativa: ${d.alternative}`),el('p',d.boundary),el('small',`Propuesta ${d.proposalId} · revisión ${d.revision.slice(0,12)}`));sheet.append(detail);
 sheet.append(el('p',d.execution.reason,'decision-owner-note'));if(d.execution.scope)sheet.append(el('p','Primera entrega acotada: corregir el signo monetario del waterfall conservando los datos. La precisión configurable queda fuera de esta reparación.','decision-consent'));
 if(d.execution.remoteId)sheet.append(el('p',`Agente: ${d.execution.remoteId} · Uso comunicado: ${d.execution.usageAcu??'pendiente'} ACU`));
 if(d.execution.candidateSha)sheet.append(el('p',`Candidato: ${d.execution.candidateSha.slice(0,12)}. No implica entrega.`));
 const buttons=el('div',undefined,'decision-actions');const plan=el('button',d.resolution?'Decisión de planificación registrada':'Encargar planificación');plan.disabled=busy||!!d.resolution||!!d.execution.remoteId;plan.onclick=()=>act(d,false);buttons.append(plan);
 const run=el('button',d.execution.releaseId?'Primera reparación publicada':d.execution.status==='blocked'?'Entrega bloqueada':d.execution.candidateSha?'Candidato en verificación':d.execution.remoteId?'Reparación enviada a Devin':d.execution.maxAcu?`Ejecutar reparación · máximo ${d.execution.maxAcu} ACU`:'Ejecución pendiente de alcance');run.disabled=busy||!d.execution.canExecute;run.onclick=()=>act(d,true);buttons.append(run);sheet.append(buttons);
 if(d.execution.releaseId){const chat=el('a','Abrir Xarts Chat con la versión activa →');chat.href='http://127.0.0.1:4320/'+(d.execution.replay?.status==='confirmed'?'?run='+encodeURIComponent(d.execution.replay.runId):'');chat.target='_blank';chat.rel='noopener';sheet.append(chat,el('p',`Versión publicada: ${d.execution.releaseId}`));if(d.execution.replay?.status==='confirmed'){const before=el('a','Ver el gráfico original →');before.href='http://127.0.0.1:4320/?run='+encodeURIComponent(d.execution.replay.sourceRunId);before.target='_blank';before.rel='noopener';sheet.append(before,el('p','Replay confirmado. Conserva los avisos de etiquetas abreviadas que no cubre esta reparación.','decision-consent'));}}
 const activity=el('a','Ver actividad real →');activity.href='/activity';sheet.append(activity);
 }else sheet.append(el('p','No hay propuestas de Xarts registradas. No se muestran ejemplos como si fueran trabajo real.'));
 const status=el('p',notice,'decision-notice');status.setAttribute('role','status');sheet.append(status);const reload=el('button','Actualizar estado');reload.disabled=busy;reload.onclick=refresh;sheet.append(reload);root.append(rail,sheet);
 }render();void refresh();const poll=()=>setTimeout(async()=>{if(!root.isConnected||root.improvementView!==viewToken)return;if(!busy)await refresh();poll();},5000);poll();
}
