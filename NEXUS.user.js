// ==UserScript==
// @name         NEXUS | Sploop Control
// @namespace    https://sploop.io/
// @version      1.8.46
// @updateURL    https://raw.githubusercontent.com/kurofunways-cpu/NEXUS/main/NEXUS.meta.js
// @downloadURL  https://raw.githubusercontent.com/kurofunways-cpu/NEXUS/main/NEXUS.user.js
// @description  NEXUS: safer background automation, responsive death-return navigation and heal.
// @match        *://sploop.io/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

// ============================================================================
// NEXUS — MENSAGEM IMPORTANTE PARA O PRÓXIMO CHAT DO CHATGPT
// ============================================================================
// Se o usuário disser "no script tem uma mensagem importante", leia este bloco.
// Este é um projeto contínuo. A versão oficial está no GitHub:
//   https://github.com/kurofunways-cpu/NEXUS
// Código executável e fonte principal: NEXUS.user.js (JavaScript / Tampermonkey)
// Metadados para atualização automática: NEXUS.meta.js
//
// Instruções para continuar o projeto em um novo chat:
// 1. Acesse o GitHub conectado e verifique a versão mais recente no repositório
//    ANTES de alterar o código. Não confie no número de versão deste comentário.
// 2. Preserve todas as funcionalidades e configurações anteriores; não remova
//    funções sem pedido explícito do usuário.
// 3. Para cada modificação solicitada, valide o código e publique a nova versão
//    de NEXUS.user.js no repositório GitHub acima.
// 4. Aumente o número de @version em NEXUS.user.js e NEXUS.meta.js e mantenha
//    os campos @updateURL e @downloadURL apontando para os arquivos oficiais.
// 5. Atualize a constante interna NEXUS_VERSION para a mesma versão.
// 6. Entregue também uma cópia completa com extensão .lua, como o usuário pede.
//    ATENÇÃO: esse arquivo continua sendo JavaScript para Tampermonkey, não Lua.
// 7. Não altere a navegação, a cama, a cura ou outras partes sem necessidade.
// 8. Informe quais testes foram feitos e o que não foi testado no jogo.
// 9. Publicar no GitHub é uma ação separada: criar um arquivo no chat NÃO
//    publica alterações automaticamente; requer acesso autorizado ao GitHub.
// 10. O Tampermonkey verifica periodicamente atualizações publicadas; não há
//     garantia de atualização instantânea e o jogo pode precisar ser recarregado.
//
// Objetivo: manter a NEXUS atualizável automaticamente a partir do GitHub.
// ============================================================================

(() => {
    'use strict';
    // Independent implementation: Heal, Profiles, held macros and predictive auto placement.
    const NEXUS_VERSION = '1.8.46';
    const INSTANCE = '__GPTMOD_HEAL_CLEAN_V1__';
    if (window[INSTANCE]) {
        // Different installed versions share this singleton key. Previously,
        // an older running script silently stopped any newer version from loading.
        // Do not start a second WebSocket controller; explain the conflict.
        const previous = window[INSTANCE];
        const warnDuplicate = () => {
            if (!document.body || document.getElementById('nx-duplicate-warning')) return;
            const notice=document.createElement('div');
            notice.id='nx-duplicate-warning';
            notice.setAttribute('role','alert');
            notice.style.cssText='position:fixed;z-index:2147483647;top:10px;left:50%;transform:translateX(-50%);max-width:90vw;padding:12px 17px;background:#172536;color:#e8fdff;border:2px solid #ffc267;border-radius:10px;font:13px Arial,sans-serif;box-shadow:0 5px 24px #000b';
            const label=previous===true?'outra versão':`v${String(previous)}`;
            notice.textContent=`NEXUS v${NEXUS_VERSION} não iniciou: ${label} já está rodando. Desative as versões antigas no Tampermonkey e recarregue.`;
            document.body.appendChild(notice);
        };
        if(document.body)warnDuplicate();
        else document.addEventListener('DOMContentLoaded',warnDuplicate,{once:true});
        console.warn('[NEXUS] Mais de uma versão ativa; desative a antiga antes de recarregar.');
        return;
    }
    window[INSTANCE] = NEXUS_VERSION;

    const PREFIX = 'gptmod_heal_clean_v1_';
    try { localStorage.removeItem(PREFIX+'autoImmunity'); } catch (_) {}
    const DEFAULTS = Object.freeze({
        spikeMacro: true,
        trapMacro: true,
        legitMacro: false,
        autoPlace: false,
        autoReplace: false,
        autoPlaceTrap: true,
        autoPlaceSpike: true,
        autoPlaceMs: 1,
        autoPlaceRate: 360,
        showStats: true,
        autoLastHat: false,
        autoSpawnBed: false,
        autoRespawn: false,
        ageRecovery: true, // ONLY after a death observed in this live connection
        returnAfterBed: false,
        returnSpin: true, // legacy key retained for existing tab preferences
        spinDegreesPerSecond: 180,
        goofyNames: false,
        smartNames: false,
        spikeMs: 1,
        trapMs: 1,
        autoPick: false,
        notifyTargets: true,
        autoHeal: true,
        legitHeal: false,
        lagGuard: true,
        threeHitGuard: true,
        intervalMs: 100,
        holdMinMs: 50,
        holdMaxMs: 100,
    });
    const limits = value => Math.max(1, Math.min(1000, Math.round(Number(value) || 1)));
    function numericSetting(key,value){
        if(key!=='spinDegreesPerSecond')return limits(value);
        const n=Number(value);
        return Number.isFinite(n)&&n>0 ? n : DEFAULTS.spinDegreesPerSecond;
    }
    // Shared settings use localStorage. Explicit per-tab overrides use
    // sessionStorage: they survive a reload of this tab but do not broadcast
    // changes to other tabs. A duplicated tab starts with a snapshot and then
    // evolves independently. All settings start in shared mode by default.
    const TAB_LOCAL_KEY = PREFIX + 'independent_tab_settings_v1';
    const tabOverrides = Object.create(null);
    function readSharedSetting(key, fallback=DEFAULTS[key]) {
        let saved = null;
        try { saved = localStorage.getItem(PREFIX + key); } catch (_) {}
        return saved === null ? fallback :
            (typeof fallback === 'boolean' ? saved === 'true' : numericSetting(key,saved));
    }
    function saveTabOverrides() {
        try { sessionStorage.setItem(TAB_LOCAL_KEY, JSON.stringify(tabOverrides)); } catch (_) {}
    }
    try {
        const saved=JSON.parse(sessionStorage.getItem(TAB_LOCAL_KEY)||'{}');
        if (saved && typeof saved==='object' && !Array.isArray(saved)) {
            for (const [key, value] of Object.entries(saved)) {
                if (!Object.hasOwn(DEFAULTS,key)) continue;
                const fallback=DEFAULTS[key];
                // Do not mistake an absent, malformed or stale override for a
                // real preference; every independent setting has a real value.
                if (typeof fallback==='boolean' && typeof value==='boolean')
                    tabOverrides[key]=value;
                else if (typeof fallback==='number' && typeof value==='number' && Number.isFinite(value))
                    tabOverrides[key]=numericSetting(key,value);
            }
        }
    } catch (_) {}
    const isTabIndependent = key => Object.hasOwn(tabOverrides,key);
    const settings = {};
    for (const [key, fallback] of Object.entries(DEFAULTS)) {
        settings[key] = isTabIndependent(key) ? tabOverrides[key] : readSharedSetting(key,fallback);
    }
    function persist(key) {
        if (isTabIndependent(key)) {
            tabOverrides[key]=settings[key];
            saveTabOverrides();
        } else {
            try { localStorage.setItem(PREFIX + key, String(settings[key])); } catch (_) {}
        }
    }
    function normalizeHolds() {
        if (settings.holdMinMs > settings.holdMaxMs) {
            // Never change another tab's shared Hold Max because this tab has
            // an independent Hold Min. randomHold already sorts both values.
            if (isTabIndependent('holdMinMs')!==isTabIndependent('holdMaxMs')) return;
            settings.holdMaxMs = settings.holdMinMs;
            persist('holdMaxMs');
        }
    }
    normalizeHolds();
    const apRateLimit = value => Math.max(240, Math.min(480, Math.round(Number(value) || 360)));
    settings.autoPlaceRate = apRateLimit(settings.autoPlaceRate);
    // Never rewrite every setting when opening/duplicating a tab: another tab
    // may have changed it meanwhile. Persist only explicit user edits.

    // Store native game switches separately from NEXUS switches. Only a real
    // user interaction changes the remembered preference; explicit `false`
    // must not become a truthy/default state when a tab is duplicated.
    const GAME_SETTINGS_KEY = 'settings';
    const GAME_BACKUP_KEY = PREFIX + 'native_settings_backup';
    const GAME_TOGGLES_KEY = PREFIX + 'native_toggles_v2';
    const gameToggles = Object.create(null);
    const nativeTouched = new Set();
    let nativeApplying = false, nativeInitTimer = null, nativeRetries = 0;
    // A restored checkmark is not proof the game's rendering option took effect.
    // Apply saved selections through the native click path, once after startup,
    // mirroring the user's successful manual OFF/ON workaround.
    const nativeApplied = new WeakMap();
    let nativeRestoreGeneration = 1;
    try {
        const saved=JSON.parse(localStorage.getItem(GAME_TOGGLES_KEY)||'{}');
        for (const [id,value] of Object.entries(saved||{})) {
            if (typeof value==='boolean') gameToggles[id]=value;
        }
    } catch (_) {}
    function validGameSettings(raw) {
        try { const v=JSON.parse(raw); return !!v && typeof v==='object' && !Array.isArray(v); }
        catch (_) { return false; }
    }
    function backupGameSettings() {
        try {
            const raw=localStorage.getItem(GAME_SETTINGS_KEY);
            if (validGameSettings(raw) && localStorage.getItem(GAME_BACKUP_KEY)!==raw)
                localStorage.setItem(GAME_BACKUP_KEY,raw);
        } catch (_) {}
    }
    function saveNativeToggles() {
        try {
            const next=JSON.stringify(gameToggles);
            if (localStorage.getItem(GAME_TOGGLES_KEY)!==next)
                localStorage.setItem(GAME_TOGGLES_KEY,next);
        } catch (_) {}
    }
    function nativeCheckbox(el) {
        return !!(el && el.tagName==='INPUT' && el.type==='checkbox' && el.id &&
            el.closest('#pop-settings'));
    }
    function rememberNativeToggle(event) {
        const el=event.target;
        if (nativeApplying || !event.isTrusted || !nativeCheckbox(el)) return;
        nativeTouched.add(el.id);
        gameToggles[el.id]=!!el.checked;
        saveNativeToggles();
        backupGameSettings();
    }
    document.addEventListener('input',rememberNativeToggle,true);
    document.addEventListener('change',rememberNativeToggle,true);
    // A game renderer may display a stored checkbox before its underlying
    // graphics flag was initialized. Matching .checked alone is insufficient.
    // Reapply the switch by invoking its own event handlers, not by assigning
    // .checked (which would only fix the appearance). One off/on or on/off
    // pair mirrors the manual workaround; do not repeat in an active session.
    function restoreNativeToggles() {
        const root=document.querySelector('#pop-settings');
        if (!root) return false;
        let changed=false, found=0;
        for (const el of root.querySelectorAll('input[type="checkbox"][id]')) {
            if (!nativeCheckbox(el)) continue;
            found++;
            if (!Object.hasOwn(gameToggles,el.id)) {
                gameToggles[el.id]=!!el.checked;
                changed=true;
            }
            if (nativeTouched.has(el.id) || el.disabled ||
                nativeApplied.get(el)===nativeRestoreGeneration) continue;
            const desired=gameToggles[el.id];
            nativeApplying=true;
            try {
                // A mismatch needs only one click to reach the desired state.
                // If the checkmark already matches, replay both transitions to
                // notify the game's graphics handlers (OFF -> ON or ON -> OFF).
                if (el.checked===desired) {
                    el.click();
                    el.click();
                } else {
                    el.click();
                }
                // Some implementations listen to change, others to click.
                // If another script prevented clicks, leave its state alone.
                if (el.checked===desired) nativeApplied.set(el,nativeRestoreGeneration);
            } catch (_) { /* The game's DOM may be replaced during startup. */ }
            finally { nativeApplying=false; }
        }
        if (changed) saveNativeToggles();
        backupGameSettings();
        return found>0;
    }
    function queueNativeRestore(delay=850) {
        if (nativeInitTimer!==null) clearTimeout(nativeInitTimer);
        nativeInitTimer=setTimeout(()=>{
            nativeInitTimer=null;
            if (restoreNativeToggles()) {nativeRetries=0;return;}
            if (++nativeRetries<=18) queueNativeRestore(400);
        },delay);
    }
    if (document.readyState==='complete') queueNativeRestore(1150);
    else window.addEventListener('load',()=>queueNativeRestore(1150),{once:true});
    // A late-created settings panel is handled when it becomes available.
    // No repeating 2-click loop: the WeakMap records each DOM checkbox.
    if (typeof MutationObserver==='function') {
        const nativeObserver=new MutationObserver(()=>{
            if (!document.querySelector('#pop-settings')) return;
            nativeObserver.disconnect(); // Never reschedule for every HUD redraw.
            queueNativeRestore(850);
        });
        const watchNativeRoot=()=>{
            if (document.body && !document.querySelector('#pop-settings'))
                nativeObserver.observe(document.body,{childList:true,subtree:true});
        };
        if (document.readyState==='loading')
            document.addEventListener('DOMContentLoaded',watchNativeRoot,{once:true});
        else watchNativeRoot();
    }
    setInterval(backupGameSettings,2000);
    window.addEventListener('pagehide',backupGameSettings);

    const player = { id: -1, alive: false, health: 100 };
    const session = {
        ws: null,
        weapon: 0,                  // last native primary/secondary selection
        weaponPacket: [0,0],         // exact native weapon selection (slot or item ID)
        weaponIds: [null,null],       // observed server-side weapon per slot
        lastNativeWeaponAt: -Infinity,
        lastAutomationAt: -Infinity,
        attacking: false,           // native attack status, not script activity
        nativeAim: null,             // exact bytes of the most recent native aim/attack
        serverAim: null,             // snapshot fallback until the client sends its aim
        self: null,                  // world position and SID from the latest native player snapshot
        connectionEpoch: 0,          // invalidates automation state on a server switch
    };
    const heal = {
        phase: 'idle', until: 0, nextAt: 0, foodSelected: false,
        holdDeadline: 0, restore: null, observedItem: null, observedItemAt: 0,
        timer: null, timerAt: Infinity, revision: 0,
        // Server snapshots are the authority. Do not retry on stale health.
        snapshotAt: 0, lastSentAt: -Infinity, sentSnapshotAt: -Infinity,
        snapshotSerial: 0, sentSnapshotSerial: -1, sentInSnapshot: 0,
        sentTimes: [], lastDamageAt: -Infinity,
    };
    // Lag Guard is based on observed *server snapshot gaps*, not RTT/ping.
    // It cannot make a stalled server process a queued heal earlier. Instead it
    // stops optional auto placements from adding to the ordered WebSocket queue,
    // and allows a fresh health snapshot to be handled before scene processing.
    const lag = {
        lastSnapshotAt:0, baselineMs:50, lastGapMs:0, largestGapMs:0,
        spikeAt:0, spikeCount:0, recoverUntil:0, stableTicks:0,
    };
    // Defensive risk detector. Entity weapon IDs are taken from public item
    // definitions, not inferred from health changes. Other melee weapons can
    // also be dangerous; low-health damage still triggers emergency healing.
    const KATANA_WEAPONS = new Set([17,36,37,40]); // stone, diamond, gold, Chillrend
    const katanaGuard = {lastSeenAt:-Infinity, target:-1, weapon:-1,
        self:null};
    const GUARD_RANGE = 205; // 140 weapon reach + movement/network margin
    function resetKatanaGuard() {
        katanaGuard.lastSeenAt=-Infinity;
        katanaGuard.target=-1;
        katanaGuard.weapon=-1;
        katanaGuard.self=null;
    }
    function observeKatanaThreat(packet, now=performance.now()) {
        if (!settings.threeHitGuard || !player.alive) return;
        let self=null;
        for (let i=1;i+18<packet.length;i+=19) {
            const id=packet[i+2]|(packet[i+3]<<8);
            if (packet[i]===0 && id===player.id && !(packet[i+8]&2)) {
                self={x:packet[i+4]|(packet[i+5]<<8),
                      y:packet[i+6]|(packet[i+7]<<8),team:packet[i+12]};
                katanaGuard.self={...self,at:now};
                break;
            }
        }
        if (!self && katanaGuard.self && now-katanaGuard.self.at<=350)
            self=katanaGuard.self;
        if (!self) return;
        let chosen=null, best=GUARD_RANGE;
        for (let i=1;i+18<packet.length;i+=19) {
            if (packet[i]!==0 || packet[i+8]&2 || !KATANA_WEAPONS.has(packet[i+10])) continue;
            const id=packet[i+2]|(packet[i+3]<<8), team=packet[i+12];
            if (id===player.id || (self.team && self.team===team)) continue;
            const x=packet[i+4]|(packet[i+5]<<8), y=packet[i+6]|(packet[i+7]<<8);
            const distance=Math.hypot(x-self.x,y-self.y);
            if (distance<best) {best=distance;chosen={id,weapon:packet[i+10]};}
        }
        if (chosen) {
            katanaGuard.target=chosen.id;
            katanaGuard.weapon=chosen.weapon;
            katanaGuard.lastSeenAt=now;
        }
    }
    function katanaNearby(now=performance.now()) {
        return settings.threeHitGuard && player.alive &&
            now-katanaGuard.lastSeenAt<=650;
    }
    function emergencyGuard(now=performance.now()) {
        if (!settings.threeHitGuard || !player.alive) return false;
        return (katanaNearby(now) && player.health<=80) ||
            (player.health<=40 && now-heal.lastDamageAt<=900);
    }
    function guardCritical(now=performance.now()) {
        return emergencyGuard(now) && player.health<=60;
    }
    const LG_QUEUE_BYTES=2048;
    function resetLagGuard() {
        lag.lastSnapshotAt=0; lag.baselineMs=50; lag.lastGapMs=0;
        lag.largestGapMs=0; lag.spikeAt=0; lag.spikeCount=0;
        lag.recoverUntil=0; lag.stableTicks=0;
    }
    function lagThreshold() {
        return Math.max(260,Math.min(650,lag.baselineMs*3.5));
    }
    function noteServerSnapshot(now=performance.now()) {
        if (lag.lastSnapshotAt>0) {
            const gap=now-lag.lastSnapshotAt;
            lag.lastGapMs=gap;
            if (gap>lagThreshold()) {
                lag.spikeCount++;
                lag.spikeAt=now;
                lag.largestGapMs=Math.round(gap);
                lag.stableTicks=0;
                lag.recoverUntil=now+Math.min(650,Math.max(230,gap*.5));
            } else {
                // Exclude spikes from the cadence baseline so one 1s stall
                // does not teach the guard to tolerate a 1s update gap.
                lag.baselineMs=lag.baselineMs*.85+gap*.15;
                lag.stableTicks++;
            }
        }
        lag.lastSnapshotAt=now;
    }
    function networkState(now=performance.now()) {
        if (!player.alive || !lag.lastSnapshotAt) return 'WAIT';
        if (now-lag.lastSnapshotAt>lagThreshold()) return 'STALL';
        if (session.ws && session.ws.bufferedAmount>=LG_QUEUE_BYTES) return 'QUEUE';
        if (now<lag.recoverUntil) return 'RECOVERY';
        return 'OK';
    }
    function pauseAutoPlaceForLag(now=performance.now()) {
        return settings.lagGuard && networkState(now)!=='OK';
    }
    const originalSend = WebSocket.prototype.send;

    // Per-tab preference for last worn hat: separate tabs may use different hats.
    const HAT_SESSION_KEY = PREFIX + 'last_hat_session';
    const hat = { current:null, wanted:null, pending:false, tries:0, nextAt:0, epoch:0, lastManualAt:-Infinity };
    try {
        const saved=Number(sessionStorage.getItem(HAT_SESSION_KEY));
        if (Number.isInteger(saved) && saved>=1 && saved<=11) hat.wanted=saved;
    } catch (_) {}
    function rememberHat(id) {
        if (!Number.isInteger(id) || id < 0 || id > 11) return;
        hat.current = id;
        hat.wanted = id > 0 ? id : null;
        hat.pending = false;
        try {
            if (hat.wanted) sessionStorage.setItem(HAT_SESSION_KEY, String(hat.wanted));
            else sessionStorage.removeItem(HAT_SESSION_KEY);
        } catch (_) {}
    }
    // AGE RECOVERY (same-connection death -> spawn only).
    // Never persist a "death observed" flag: reloads and duplicated tabs begin
    // without an eligible death, even if their settings were copied.
    const ageRecovery = {
        armed:false, pending:false, connectionEpoch:0, phase:'idle',
        equipAt:0, deadline:0, hatConfirmed:false, timer:null,
        revision:0, status:'Aguardando morte nesta aba'
    };
    function clearAgeRecovery(status='Aguardando morte nesta aba') {
        ++ageRecovery.revision;
        if(ageRecovery.timer!==null) clearTimeout(ageRecovery.timer);
        ageRecovery.timer=null;
        ageRecovery.armed=false;
        ageRecovery.pending=false;
        ageRecovery.phase='idle';
        ageRecovery.hatConfirmed=false;
        ageRecovery.status=status;
    }
    function wakeAgeRecovery(delay) {
        if(ageRecovery.timer!==null)clearTimeout(ageRecovery.timer);
        ageRecovery.timer=null;
        if(!ageRecovery.pending)return;
        const revision=++ageRecovery.revision;
        ageRecovery.timer=setTimeout(()=>{
            if(revision!==ageRecovery.revision)return;
            ageRecovery.timer=null;
            tryAgeRecovery();
        },Math.max(1,Math.ceil(delay)));
    }
    function noteAgeRecoveryDeath() {
        // Initial server handshake, a reload or a server hop is NOT a death.
        const wasAlive=player.alive && connected();
        clearAgeRecovery(wasAlive?'Morte detectada; aguardando respawn':'Sem morte nesta aba');
        if(wasAlive && settings.ageRecovery){
            ageRecovery.armed=true;
            ageRecovery.connectionEpoch=session.connectionEpoch;
        }
    }
    function armAgeRecoverySpawn() {
        const eligible=settings.ageRecovery && ageRecovery.armed && player.alive &&
            ageRecovery.connectionEpoch===session.connectionEpoch;
        // One death can authorize exactly one new spawn, never future spawns.
        ageRecovery.armed=false;
        if(!eligible){
            ageRecovery.pending=false;
            ageRecovery.phase='idle';
            ageRecovery.status='Sem morte nesta aba';
            return;
        }
        ageRecovery.pending=true;
        ageRecovery.phase='equip';
        ageRecovery.equipAt=0;
        ageRecovery.hatConfirmed=false;
        ageRecovery.deadline=performance.now()+4500;
        ageRecovery.status='Equipando Immunity Gear';
        tryAgeRecovery();
    }
    function finishAgeRecovery(status,usedFood=false) {
        ++ageRecovery.revision;
        if(ageRecovery.timer!==null)clearTimeout(ageRecovery.timer);
        ageRecovery.timer=null;
        ageRecovery.pending=false;
        ageRecovery.phase=usedFood?'done':'failed';
        ageRecovery.status=status;
        // If the user enabled Last Hat, restore it AFTER the one-off food
        // rather than allowing that feature to undo Immunity Gear first.
        if(settings.autoLastHat && hat.wanted && hat.wanted!==6 && player.alive){
            hat.pending=true;hat.tries=0;hat.nextAt=performance.now()+100;
        }
    }
    function tryAgeRecovery(now=performance.now()) {
        if(!ageRecovery.pending)return;
        if(!settings.ageRecovery || !player.alive || !connected() ||
            ageRecovery.connectionEpoch!==session.connectionEpoch){
            clearAgeRecovery('Recuperação cancelada');return;
        }
        if(now>ageRecovery.deadline){
            finishAgeRecovery('Sem resposta/ângulo para consumir comida');return;
        }
        if(ageRecovery.phase==='equip') {
            if(session.ws.bufferedAmount>4096){wakeAgeRecovery(50);return;}
            // Public clients use opcode 5 for hats and ID 6 for Immunity Gear.
            if(!transmit([5,6])){finishAgeRecovery('Immunity Gear não enviado');return;}
            ageRecovery.equipAt=now;
            ageRecovery.phase='food';
            ageRecovery.status='Aguardando equipamento; 1 comida pendente';
            wakeAgeRecovery(130);
            return;
        }
        if(ageRecovery.phase!=='food')return;
        // Await an observed hat or allow a short ordered WebSocket delay.
        // The server, not the sent packet, decides whether the hat was equipped.
        const elapsed=now-ageRecovery.equipAt;
        const minimum=ageRecovery.hatConfirmed?40:230;
        if(elapsed<minimum){wakeAgeRecovery(minimum-elapsed);return;}
        if(!currentAim() || session.ws.bufferedAmount>4096){
            ageRecovery.status='Aguardando mira/conexão para 1 comida';
            wakeAgeRecovery(45);return;
        }
        // This one food use is independent of Auto Heal, Heal ms and HP.
        // It is a *single attempt*, not a burst of duplicate attack packets.
        if(heal.phase!=='idle')cancelHeal();
        releaseMacroSelection();
        session.lastAutomationAt=now;
        if(session.attacking)transmit([18]);
        if(!transmit([0,2])){finishAgeRecovery('Não selecionou a comida');return;}
        const sent=transmit([19,...currentAim()]);
        transmit([18]);
        restoreWeapon();
        if(sent){
            // Keep Auto Heal from immediately counting the same stale
            // health snapshot as authorization to use another food.
            heal.lastSentAt=now;
            heal.sentSnapshotAt=heal.snapshotAt;
            heal.sentSnapshotSerial=heal.snapshotSerial;
            heal.sentInSnapshot++;
            heal.nextAt=now+smartHealInterval();
            heal.sentTimes.push(now);
            if(heal.sentTimes.length>80)heal.sentTimes.splice(0,heal.sentTimes.length-80);
        }
        finishAgeRecovery(sent ?
            (ageRecovery.hatConfirmed?'1 comida enviada após Immunity':'1 comida enviada (chapéu não confirmado)') :
            'Falha ao enviar comida',sent);
    }
    function observeAgeRecoveryHat(id) {
        if(ageRecovery.pending && id===6)ageRecovery.hatConfirmed=true;
    }

    function resetRespawnHat() {
        hat.epoch++;
        hat.tries=0; hat.nextAt=0;
        hat.pending=!!(settings.autoLastHat && hat.wanted && player.alive);
        hat.current=null;
    }
    function observeSelfHat(id, now=performance.now()) {
        if (!Number.isInteger(id) || id<0 || id>11) return;
        hat.current=id;
        if (hat.pending) {
            if (id===hat.wanted) { hat.pending=false; return; }
            // Keep the pre-death hat during the un-equipped respawn phase.
            return;
        }
        if (id>0 && id!==hat.wanted && now-hat.lastManualAt>650) rememberHat(id);
        // Keep old hat ID after death until the next user choice. A zero in a
        // fresh spawn snapshot doesn't mean the previous hat was unequipped.
    }
    function tryRestoreHat(now=performance.now()) {
        if (ageRecovery.pending) return; // Do not undo Immunity before the food.
        if (!hat.pending || !settings.autoLastHat || !player.alive || !connected() ||
            !hat.wanted || hat.tries>=2 || now<hat.nextAt ||
            session.ws.bufferedAmount>2048) return;
        // The game/server still decides whether the hat can be equipped.
        if (transmit([5,hat.wanted])) {
            hat.tries++;
            hat.nextAt=now+1500;
            if (hat.tries>=2) hat.pending=false;
        }
    }
    // The Cosy Bed is aimed at the first confirmed spawn position. Movement is
    // driven primarily by server snapshots so hidden tabs can keep working;
    // timers are ONLY safeguards. A frozen tab cannot run JavaScript at all.
    const SPAWN_BED_TYPE=9;  // [0,9]: Cosy Bed selection (item ID 16)
    const SPAWN_BED_ID=16;    // Inventory item ID (unlock packet 2)
    const SPAWN_BED_ENTITY_TYPE=15; // World entity SPAWN (not item ID 16)
    // Distinguish inventory unlock (16) from the actual in-world bed (15).
    const BED_BUILD_DISTANCE=76;
    const BED_STEP_DISTANCE=77;
    const BED_PLACE_MIN=71;
    const BED_PLACE_MAX=82;
    const BED_MAX_MOVE_MS=880; // Hard upper bound; each leg uses its own distance-based deadline.
    const BED_MAX_TASK_MS=8000; // Release the controls, then retry instead of abandoning the life.
    const BED_RETRY_MIN_MS=750, BED_RETRY_MAX_MS=12000;
    const BED_NAV_GRID=12;
    const BED_NAV_RADIUS=240;
    const BED_NAV_BODY=28;
    const BED_NAV_WAYPOINT=13;
    const BED_NAV_MAX_LEGS=48;
    const BED_NAV_MAX_NO_ROUTE=22;
    // An off-center but newly observed owned bed still counts as placed.
    // Exact-center learning remains strict (12 units in rememberBedSuccess).
    const BED_POSITION_TOLERANCE=96; // Allow confirmed, slightly offset beds; center learning stays strict
    // Server entity updates may be incremental. A wall must NOT disappear from
    // local navigation just because it did not receive a packet for 1.25s.
    // Explicit state=DELETE packets evict it immediately; TTL is a failsafe.
    const BED_NEARBY_TTL=120000;
    const BED_SNAPSHOT_TTL=850;
    // Current spawn must be confirmed in two consistent snapshots.
    const BED_ORIGIN_MAX_DRIFT=42, BED_ORIGIN_CONFIRM_GAP=1500;
    // Save only successful, server-observed paths; negative examples are
    // stored per obstacle layout. Coordinates are relative to the NEW spawn,
    // never absolute map positions from another server.
    // The route archive is kept separate from older, incorrectly mapped collision data.
    // The old route archive was generated while wood walls (type 8) were
    // mistakenly considered radius 0. Never replay paths learned on that map.
    // Do not replay old unscoped routes from earlier servers/bed locations.
    const BED_ROUTE_STORAGE=PREFIX+'bed_route_knowledge_v4';
    const BED_ROUTE_MEMORY_MAX=36;
    let bedRouteKnowledge=[];
    try {
        const records=JSON.parse(localStorage.getItem(BED_ROUTE_STORAGE)||'[]');
        if(Array.isArray(records))bedRouteKnowledge=records.filter(r=>
            r && typeof r.key==='string' && r.key.length<500 &&
            typeof r.server==='string' && r.server.length<250 &&
            r.anchor && Number.isFinite(r.anchor.x) && Number.isFinite(r.anchor.y) &&
            (!r.good || (Array.isArray(r.good) && r.good.length<=16 &&
                r.good.every(p=>p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
                    Math.abs(p.x)<=240 && Math.abs(p.y)<=240))) &&
            r.bad && typeof r.bad==='object' && !Array.isArray(r.bad))
            .slice(0,BED_ROUTE_MEMORY_MAX).map(r=>({
                ...r,
                blocks:Array.isArray(r.blocks)?r.blocks.filter(b=>b &&
                    [b.x,b.y,b.dx,b.dy].every(Number.isFinite) &&
                    Math.abs(b.x)<260 && Math.abs(b.y)<260).slice(-42):[],
                badGoals:Array.isArray(r.badGoals)?r.badGoals.filter(p=>p &&
                    Number.isFinite(p.x) && Number.isFinite(p.y) &&
                    Math.abs(p.x)<260 && Math.abs(p.y)<260).slice(-24):[],
                goodGoal:r.goodGoal && Number.isFinite(r.goodGoal.x) &&
                    Number.isFinite(r.goodGoal.y) ? r.goodGoal:null
            }));
    } catch (_) {}
    const bed={pending:false,unlocked:false,confirmed:false,tries:0,
        nextAt:0,lastAt:0,epoch:0,preSpawnUnlockAt:0,
        spawnAt:0,spawnCandidate:null,spawnCandidateCount:0,
        spawnAnchorConfirmed:false,earlyBeds:new Map(),
        phase:'idle',origin:null,self:null,sid:null,nearby:new Map(),
        stepAngle:null,startedAt:0,stopTimer:null,moveOwned:false,
        moveRevision:0,moveTries:0,moveDirection:'out',awaitFreshAt:0,
        route:[],routeAt:0,waypoint:0,noRoute:0,blocked:[],localBlocked:[],
        moveFeedbackAt:0,moveLastPos:null,clearance:BED_NAV_BODY,
        moveFrom:null,moveTo:null,moveLimitMs:BED_MAX_MOVE_MS,
        locked:false,lockSince:0,lockTimer:null,
        // The keyboard can be held while navigation owns movement. Once a
        // placement is dispatched, hand that input back without waiting for
        // the server entity snapshot.
        handoffMove:false,manualAfterPlacement:false,
        lastManualMoveAt:-Infinity,moveKeys:new Set(),abortReason:'',
        retryCount:0,retryReason:'',retryLayout:null,
        socketEpoch:0,layoutKey:null,layoutCandidate:null,layoutCandidateCount:0,
        trace:[],lastLearned:false,usedLearned:false,
        failedThisRun:0,lastFailureAt:0,placementFailures:0,
        knownBedIds:new Set(),seenSnapshots:0};
    const bedClock={worker:null,unavailable:false};
    function makeBedWorker() {
        if (bedClock.worker || bedClock.unavailable) return bedClock.worker;
        if (typeof Worker!=='function' || typeof Blob!=='function' ||
            typeof URL.createObjectURL!=='function') {bedClock.unavailable=true;return null;}
        let url=null;
        try {
            url=URL.createObjectURL(new Blob([`let timer=null;
                onmessage=e=>{
                    if(timer!==null)clearTimeout(timer);
                    timer=null;
                    if(e.data && e.data.type==='arm'){
                        const rev=e.data.rev;
                        timer=setTimeout(()=>{timer=null;postMessage(rev);},
                            Math.max(1,Math.ceil(e.data.delay)));
                    }
                };`],{type:'text/javascript'}));
            const worker=new Worker(url);
            bedClock.worker=worker;
            worker.onmessage=e=>{
                if (e.data!==bed.moveRevision || !bed.moveOwned) return;
                // Some workers wake early; never stop the newer movement.
                if (performance.now()-bed.startedAt+2>=bed.moveLimitMs)
                    onBedMovementTimeout();
            };
            worker.onerror=()=>{
                bedClock.unavailable=true;
                worker.terminate();
                if(bedClock.worker===worker)bedClock.worker=null;
            };
            return worker;
        } catch (_) {bedClock.unavailable=true;return null;}
        finally {if(url) URL.revokeObjectURL(url);}
    }
    function clearBedStop() {
        if (bed.stopTimer!==null) clearTimeout(bed.stopTimer);
        bed.stopTimer=null;
        bed.moveRevision++;
        if (bedClock.worker) {
            try {bedClock.worker.postMessage({type:'cancel'});} catch (_) {}
        }
    }
    function stopBedMovement(sendStop=true, forceStop=false) {
        // A bed may have already switched to 'placing', leaving moveOwned
        // false while the game's last movement is still in flight. At a
        // placement attempt or confirmed success, force a STOP anyway.
        clearBedStop();
        if (sendStop && (bed.moveOwned || forceStop) && connected() &&
            bed.socketEpoch===session.connectionEpoch) transmit([15]);
        bed.moveOwned=false;
    }
    function releaseBedInput(resumeHeldKeys=false) {
        const held=resumeHeldKeys ? [...bed.moveKeys] : [];
        const activeHandoff=bed.handoffMove && !bed.locked;
        if (bed.lockTimer !== null) clearTimeout(bed.lockTimer);
        bed.lockTimer = null;
        bed.locked = false;
        bed.lockSince = 0;
        // Once a blocked key has been handed back, do not erase the tracking
        // on bed confirmation/abort. Otherwise its eventual keyup cannot STOP.
        if (activeHandoff) return;
        bed.handoffMove=false;
        bed.moveKeys.clear();
        if (!held.length || !connected() || !player.alive ||
            bed.socketEpoch!==session.connectionEpoch) return;
        // The native game may never see the initial keydown that was blocked.
        // Resume a continuously held WASD/arrow direction immediately.
        for (const key of held) bed.moveKeys.add(key);
        const x=Number(held.includes('KeyD')||held.includes('ArrowRight'))-
                Number(held.includes('KeyA')||held.includes('ArrowLeft'));
        const y=Number(held.includes('KeyS')||held.includes('ArrowDown'))-
                Number(held.includes('KeyW')||held.includes('ArrowUp'));
        if (x || y) {
            bed.handoffMove=transmit([1,...apAngleBytes(Math.atan2(y,x))]);
            // If a player is holding movement already, preserve a short window
            // to confirm the placed bed but do not re-enter automated navigation.
            if (bed.handoffMove && bed.phase==='placing') bed.manualAfterPlacement=true;
        }
    }
    function claimBedInput(now=performance.now()) {
        if (bed.locked) return true;
        if (!bed.pending || !bed.unlocked || !bed.origin || !bed.self || !bedCanWork(now)) return false;
        bed.locked = true;
        bed.lockSince = now;
        bed.handoffMove=false;
        bed.moveKeys.clear();
        bed.lastManualMoveAt = -Infinity;
        // A key pressed at the instant of spawn can leave native movement active.
        // Release it once; all later native movement packets are ignored until
        // the bed routine is complete. Automated sends bypass the interception.
        transmit([15]);
        const epoch = bed.epoch;
        bed.lockTimer = setTimeout(() => {
            if (bed.locked && bed.pending && bed.epoch === epoch)
                retrySpawnBed('Tempo limite de navegação');
        }, BED_MAX_TASK_MS);
        return true;
    }
    function onBedMovementTimeout(confirmedStall=false) {
        if (!bed.moveOwned || bed.phase!=='moving') return;
        const now=performance.now(),actual=bed.self,goal=bed.moveTo;
        // A stall can occur AFTER a successful partial movement. Saving only
        // zero-progress failures was the major bug in 1.8.14. Never learn
        // failures from a tab that has stopped receiving authoritative snapshots.
        const fresh=actual && actual.at>bed.startedAt+35 &&
            now-actual.at<=BED_SNAPSHOT_TTL && goal &&
            bedDistance(actual,goal)>BED_NAV_WAYPOINT;
        const stationary=fresh && bed.moveLastPos &&
            bedDistance(actual,bed.moveLastPos)<4;
        stopBedMovement();
        bed.phase='await-position';bed.awaitFreshAt=now;bed.nextAt=now+5;
        // Knockback and incoming damage are not evidence of a solid wall.
        if (fresh && (confirmedStall || stationary) && now-heal.lastDamageAt>450) {
            rememberBedFailure(actual,goal);
        }
        bed.route=[];bed.routeAt=0;bed.waypoint=0;
    }
    function armBedStop(now) {
        const rev=bed.moveRevision;
        const delay=Math.max(1,Math.ceil(bed.moveLimitMs-(now-bed.startedAt)));
        bed.stopTimer=setTimeout(()=>{
            if (rev!==bed.moveRevision) return;
            onBedMovementTimeout();
        },delay);
        const worker=makeBedWorker();
        if (worker) {
            try {worker.postMessage({type:'arm',rev,delay});}
            catch (_) {bedClock.unavailable=true;worker.terminate();bedClock.worker=null;}
        }
    }
    // A safety timeout ends a navigation slice, not the spawn-bed task.
    // Keep the current-life anchor, inventory and actual confirmed obstacles.
    // The next fresh snapshot may recover from a tab switch or knockback.
    function retrySpawnBed(reason,now=performance.now()){
        if(!bed.pending || !settings.autoSpawnBed || !player.alive ||
            bed.socketEpoch!==session.connectionEpoch)return false;
        stopBedMovement();
        bed.phase='retry';
        if(bed.locked)releaseBedInput(true);
        bed.retryCount++;
        bed.retryReason=reason;
        bed.retryLayout=bed.origin?bedLayoutSignature(now):null;
        bed.route=[];bed.routeAt=0;bed.waypoint=0;bed.moveTo=null;
        bed.moveTries=0;bed.noRoute=0;bed.tries=0;bed.placementFailures=0;
        bed.awaitFreshAt=now;
        bed.nextAt=now+Math.min(BED_RETRY_MAX_MS,
            BED_RETRY_MIN_MS*2**Math.min(5,bed.retryCount-1));
        if(settings.returnAfterBed && deathReturn.target && deathReturn.phase==='waiting')
            deathReturn.status='Cama: nova tentativa pendente';
        return true;
    }
    function abortSpawnBed(reason='Manual movement') {
        if (!bed.pending) return;
        stopBedMovement();
        releaseBedInput();
        bed.pending=false;
        bed.phase='cancelled';
        bed.abortReason=reason;
        if(settings.returnAfterBed && deathReturn.target && deathReturn.phase==='waiting')
            deathReturn.status='Retorno pausado: cama interrompida';
    }
    function resetSpawnBed() {
        stopBedMovement();
        releaseBedInput();
        bed.epoch++;
        bed.spawnAt=performance.now();
        bed.spawnCandidate=null;bed.spawnCandidateCount=0;
        bed.spawnAnchorConfirmed=false;bed.earlyBeds.clear();
        bed.pending=!!(settings.autoSpawnBed && player.alive);
        // An inventory update can precede spawn during fast reconnects.
        bed.unlocked=!!(bed.preSpawnUnlockAt && performance.now()-bed.preSpawnUnlockAt<1500);
        bed.preSpawnUnlockAt=0;bed.confirmed=false;bed.tries=0;
        bed.nextAt=0;bed.lastAt=0;bed.phase='await-position';
        bed.origin=null;bed.self=null;bed.sid=null;bed.nearby.clear();
        bed.stepAngle=null;bed.startedAt=0;bed.awaitFreshAt=0;
        bed.moveTries=0;bed.moveDirection='out';bed.abortReason='';
        bed.retryCount=0;bed.retryReason='';bed.retryLayout=null;
        bed.route=[];bed.routeAt=0;bed.waypoint=0;bed.noRoute=0;bed.blocked=[];bed.localBlocked=[];
        bed.moveFeedbackAt=0;bed.moveLastPos=null;bed.clearance=BED_NAV_BODY;
        bed.moveFrom=null;bed.moveTo=null;bed.moveLimitMs=BED_MAX_MOVE_MS;
        bed.socketEpoch=session.connectionEpoch;
        bed.layoutKey=null;bed.layoutCandidate=null;bed.layoutCandidateCount=0;
        bed.trace=[];bed.lastLearned=false;bed.usedLearned=false;
        bed.failedThisRun=0;bed.lastFailureAt=0;bed.placementFailures=0;
        bed.handoffMove=false;bed.manualAfterPlacement=false;bed.moveKeys.clear();
        bed.knownBedIds.clear();bed.seenSnapshots=0;
    }
    // RETURN AFTER BED: guard the same death-position anchor continuously
    // after the bed is server-confirmed. Displacements trigger another path
    // without resetting the death target. Learned paths still use snapshots.
    const RETURN_ROUTES_KEY=PREFIX+'return_routes_v1';
    // On a brief server stall the death event can arrive later than the final
    // position snapshot. Keep the last position from THIS socket for 12s.
    const RETURN_TTL=12000, RETURN_SNAPSHOT_TTL=1050;
    const RETURN_ARRIVED=20, RETURN_WAYPOINT=16;
    // A death inside this radius keeps the ORIGINAL destination, not the latest death.
    const RETURN_DEATH_RADIUS=120;
    const SPIN_INTERVAL_MS=1000/60;
    const spin={lastSentAt:-Infinity,lastAt:null,angle:0,aim:null};
    // Return is sticky within a small tolerance. A real knockback should
    // restart navigation on its FIRST server-confirmed displacement, not after
    // multiple snapshots while opponents push the character farther away.
    const RETURN_REENGAGE=29;
    const RETURN_MAX_TIME=60000, RETURN_MAX_STEPS=220;
    // Structural obstacles persist between incremental world updates. Deletions
    // are applied immediately by observeReturnObjects; TTL is a safety fallback.
    const RETURN_MAP_TTL=300000;
    const returnPaths=[];
    try {
        const saved=JSON.parse(localStorage.getItem(RETURN_ROUTES_KEY)||'[]');
        if(Array.isArray(saved)) for(const r of saved.slice(0,8)) {
            if(r && typeof r.socket==='string' && r.socket.length<250 &&
                typeof r.layout==='string' && r.layout.length<500 &&
                r.spawn && r.goal && [r.spawn.x,r.spawn.y,r.goal.x,r.goal.y].every(Number.isFinite) &&
                r.validated===2 &&
                Array.isArray(r.path) && r.path.length<=160 && r.path.length>0 &&
                r.path.every(p=>p && Number.isFinite(p.x)&&Number.isFinite(p.y)))
                returnPaths.push(r);
        }
    } catch (_) {}
    function saveReturnPaths() {
        try {localStorage.setItem(RETURN_ROUTES_KEY,JSON.stringify(returnPaths.slice(0,8)));}
        catch (_) {}
    }
    const deathReturn={
        target:null, lastSelf:null, aliveTrail:[], recorded:[],
        nextAt:0, phase:'idle', epoch:0, socketEpoch:0, server:'',
        self:null, route:[], step:0, attempted:0,
        startedAt:0, moveAt:0, moveFrom:null, moveTo:null,
        moveOwned:false, moveTimer:null, moveRevision:0,
        lastMovedAt:0,lastMovedPos:null, bad:[], fails:0,
        trace:[], usedRecorded:false, learned:false, status:'Aguardando morte',
        driftSamples:0, manualMove:false, arrivals:0,
        lastHitAt:-Infinity, lastKnockbackAt:-Infinity,
        spawnLayout:'clear',
        objects:new Map(), movers:new Map(), frontObstacle:null, forceRethink:false,
        // Navigation confidence comes from actual server-confirmed progress,
        // NOT from changes in any direction or assumptions about wall radii.
        observedAt:0,forwardBest:0,progressSamples:0,observedSpeed:0.24,
        recentSites:[],detourSide:1,verifiedPath:[],learningClean:true,
        lastPlanSignature:'',repeatedPlans:0,lastPlanOrigin:null,lastPlanAt:0,
    };
    const returnDist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
    function stopReturnMovement(force=false) {
        if(deathReturn.moveTimer!==null)clearTimeout(deathReturn.moveTimer);
        deathReturn.moveTimer=null;deathReturn.moveRevision++;
        if((deathReturn.moveOwned||force) && connected() &&
            deathReturn.socketEpoch===session.connectionEpoch)transmit([15]);
        deathReturn.moveOwned=false;
    }
    function resetReturnForServer() {
        stopReturnMovement(false);
        deathReturn.epoch++;
        deathReturn.target=null;deathReturn.lastSelf=null;
        deathReturn.aliveTrail=[];deathReturn.recorded=[];
        deathReturn.self=null;deathReturn.route=[];deathReturn.step=0;
        deathReturn.moveFrom=null;deathReturn.moveTo=null;
        deathReturn.attempted=0;deathReturn.startedAt=0;
        deathReturn.nextAt=0;deathReturn.bad=[];deathReturn.fails=0;
        deathReturn.driftSamples=0;deathReturn.manualMove=false;deathReturn.arrivals=0;
        deathReturn.lastHitAt=-Infinity;deathReturn.lastKnockbackAt=-Infinity;
        deathReturn.trace=[];deathReturn.objects.clear();deathReturn.movers.clear();deathReturn.frontObstacle=null;
        deathReturn.observedAt=0;deathReturn.forwardBest=0;deathReturn.progressSamples=0;
        deathReturn.recentSites=[];deathReturn.detourSide=1;
        deathReturn.verifiedPath=[];deathReturn.learningClean=true;
        deathReturn.lastPlanSignature='';deathReturn.repeatedPlans=0;
        deathReturn.lastPlanOrigin=null;deathReturn.lastPlanAt=0;
        deathReturn.spawnLayout='clear';
        deathReturn.phase='idle';deathReturn.status='Aguardando morte';
        deathReturn.socketEpoch=session.connectionEpoch;
        deathReturn.server=String(session.ws?.url||'');
    }
    function cancelReturn(reason='Interrompido',stop=true) {
        if(stop)stopReturnMovement();
        deathReturn.phase='cancelled';deathReturn.status=reason;
        deathReturn.route=[];deathReturn.step=0;deathReturn.moveTo=null;
    }
    function recordReturnTrail(point) {
        const a=deathReturn.aliveTrail;
        if(!a.length || returnDist(a[a.length-1],point)>=18) {
            a.push({x:point.x,y:point.y});
            if(a.length>600)a.splice(0,120);
        }
    }
    function recordReturnPosition(point,now=performance.now()) {
        if(!player.alive)return;
        const current={x:point.x,y:point.y,at:now};
        const previous=deathReturn.self;
        // Reject timestamp gaps: a late position after a stalled socket is not
        // evidence of knockback. Compare only two fresh observed positions.
        if(deathReturn.target && previous && now-previous.at>=0 &&
           now-previous.at<=500 && now-deathReturn.lastHitAt<=750 &&
           ['moving','ready','arrived'].includes(deathReturn.phase)) {
            const before=returnDist(previous,deathReturn.target);
            const after=returnDist(current,deathReturn.target);
            if(after>before+11 && after>RETURN_ARRIVED+4 &&
               now-deathReturn.lastKnockbackAt>130) {
                deathReturn.lastKnockbackAt=now;
                if(deathReturn.phase==='moving') {
                    // A hit can reverse or sidestep a planned leg. Do NOT
                    // mark that leg as a blocked wall: damage caused the drift.
                    stopReturnMovement();
                    deathReturn.phase='ready';deathReturn.route=[];
                    deathReturn.step=0;deathReturn.nextAt=now;
                    deathReturn.status='Empurrão detectado: corrigindo';
                }
            }
        }
        if(previous && ['moving','ready'].includes(deathReturn.phase))
            returnLearnPassage(previous,current,now);
        deathReturn.lastSelf=current;
        deathReturn.self=current;
        recordReturnTrail(current);
        if(deathReturn.phase==='moving'||deathReturn.phase==='ready'){
            const a=deathReturn.trace;
            if(!a.length||returnDist(a.at(-1),current)>=12)a.push({x:current.x,y:current.y});
            // Track locations actually reached, for a loop penalty in planning.
            const h=deathReturn.recentSites;
            while(h.length && now-h[0].at>9500)h.shift();
            if(!h.length || returnDist(h.at(-1),current)>32){
                h.push({x:current.x,y:current.y,at:now});
                if(h.length>32)h.splice(0,h.length-32);
            }
            // Save positions, not attempted headings. This can learn a
            // successful correction after a failed command, or a manual route.
            const verified=deathReturn.verifiedPath;
            if(verified.length && deathReturn.learningClean){
                const gap=returnDist(verified.at(-1),current);
                if(gap>145)deathReturn.learningClean=false; // teleport / lost data
                else if(gap>=9)verified.push({x:current.x,y:current.y});
                if(verified.length>550){
                    const reduced=verified.filter((_,i)=>i%2===0);
                    reduced.push(verified.at(-1));
                    verified.splice(0,verified.length,...reduced);
                }
            }
        }
    }
    function captureReturnDeath(now=performance.now()) {
        if(!player.alive)return; // duplicate death messages must not move the anchor
        const previousTarget=deathReturn.target;
        stopReturnMovement();
        deathReturn.epoch++;
        deathReturn.phase='idle';deathReturn.status='Aguardando cama';
        deathReturn.target=null;deathReturn.route=[];deathReturn.trace=[];
        deathReturn.bad=[];deathReturn.fails=0;deathReturn.attempted=0;
        deathReturn.driftSamples=0;deathReturn.manualMove=false;deathReturn.arrivals=0;
        deathReturn.lastHitAt=-Infinity;deathReturn.lastKnockbackAt=-Infinity;
        deathReturn.recentSites=[];deathReturn.detourSide=1;
        deathReturn.verifiedPath=[];deathReturn.learningClean=true;
        deathReturn.lastPlanSignature='';deathReturn.repeatedPlans=0;
        deathReturn.lastPlanOrigin=null;deathReturn.lastPlanAt=0;
        deathReturn.recorded=[];
        if(!settings.returnAfterBed)return;
        const last=deathReturn.lastSelf;
        // Never navigate to a stale or previous-server position.
        if(!last || now-last.at>RETURN_TTL ||
            deathReturn.socketEpoch!==session.connectionEpoch){
            deathReturn.status='Morte: última posição não recebida';return;
        }
        // The circle is a retention boundary, never an arrival boundary.
        deathReturn.target=previousTarget && returnDist(last,previousTarget)<=RETURN_DEATH_RADIUS
            ? previousTarget : {x:last.x,y:last.y};
        const trace=deathReturn.aliveTrail;
        if(trace.length>2)deathReturn.recorded=trace.slice(-500).map(p=>({x:p.x,y:p.y}));
    }
    function onReturnRespawn() {
        stopReturnMovement();
        deathReturn.epoch++;
        deathReturn.phase='waiting';deathReturn.status=deathReturn.target ? 'Aguardando cama confirmada' : 'Morte sem posição confirmada';
        deathReturn.self=null;deathReturn.lastSelf=null;deathReturn.aliveTrail=[];
        deathReturn.movers.clear(); // previous-life dynamic hitboxes are stale
        deathReturn.trace=[];deathReturn.route=[];deathReturn.step=0;
        deathReturn.moveTo=null;deathReturn.attempted=0;deathReturn.startedAt=0;
        deathReturn.bad=[];deathReturn.fails=0;deathReturn.nextAt=0;
        deathReturn.driftSamples=0;deathReturn.manualMove=false;deathReturn.arrivals=0;
        deathReturn.lastHitAt=-Infinity;deathReturn.lastKnockbackAt=-Infinity;
        deathReturn.observedAt=0;deathReturn.forwardBest=0;deathReturn.progressSamples=0;
        deathReturn.recentSites=[];deathReturn.detourSide=1;
        deathReturn.verifiedPath=[];deathReturn.learningClean=true;
        deathReturn.lastPlanSignature='';deathReturn.repeatedPlans=0;
        deathReturn.lastPlanOrigin=null;deathReturn.lastPlanAt=0;
        deathReturn.socketEpoch=session.connectionEpoch;
        deathReturn.server=String(session.ws?.url||'');
    }
    // Hitbox categories are not identical: solid objects stop movement,
    // spikes/traps are dangerous but traversable, and mobile entities change
    // position. Avoid turning a player or a damage zone into a permanent wall.
    // Entity types come from server snapshots, not inventory IDs.
    const RETURN_NAV_HAZARDS=new Set([2,7,9,17]);
    const RETURN_MOVING_TTL=850;
    function observeReturnObjects(packet,now=performance.now()) {
        if(!(packet instanceof Uint8Array)||(packet.length-1)%19!==0)return;
        const objects=deathReturn.objects, movers=deathReturn.movers;
        for(let i=1;i+18<packet.length;i+=19){
            const type=packet[i],sid=packet[i+1],id=packet[i+2]|packet[i+3]<<8;
            const key=sid+':'+type+':'+id;
            if(packet[i+8]&2){
                const removed=objects.get(key);
                objects.delete(key);movers.delete(key);
                if(removed){
                    deathReturn.bad=deathReturn.bad.filter(f=>{
                        const vx=f.to.x-f.from.x,vy=f.to.y-f.from.y,
                            len2=vx*vx+vy*vy;
                        if(len2<1)return true;
                        const t=Math.max(0,Math.min(1,
                            ((removed.x-f.from.x)*vx+(removed.y-f.from.y)*vy)/len2));
                        const px=f.from.x+t*vx,py=f.from.y+t*vy;
                        return Math.hypot(removed.x-px,removed.y-py)>removed.radius+42;
                    });
                    deathReturn.route=[];deathReturn.step=0;
                    deathReturn.nextAt=now;
                }
                continue;
            }
            const x=packet[i+4]|packet[i+5]<<8,
                  y=packet[i+6]|packet[i+7]<<8;
            if(type===0 || BED_NAV_DYNAMIC.has(type)){
                if(type===0 && id===player.id)continue;
                const old=movers.get(key),dt=old?now-old.at:0;
                const dx=old?x-old.x:0,dy=old?y-old.y:0;
                const speed=dt>15&&dt<500?Math.hypot(dx,dy)/dt:Infinity;
                const vx=speed<=1.5?dx/dt:0,vy=speed<=1.5?dy/dt:0;
                movers.set(key,{x,y,at:now,type,sid,team:packet[i+12],
                    vx,vy,radius:type===0?34:Math.min(65,BED_ENTITY_RADII[type]??35)});
                continue;
            }
            if(!bedBlocksMovement(type) && !RETURN_NAV_HAZARDS.has(type))continue;
            const old=objects.get(key);
            objects.set(key,{type,sid,x,y,radius:BED_ENTITY_RADII[type]??40,
                navPad:old?.navPad??0,at:now});
        }
        // Keep static entities across incremental world packets. Remove only
        // explicit server deletions or genuinely old snapshots; avoid the old
        // two-minute amnesia in which a standing wall disappeared from A*.
        for(const [key,v] of objects)
            if(now-v.at>RETURN_MAP_TTL)objects.delete(key);
        if(objects.size>650)for(const [key] of [...objects.entries()]
            .sort((a,b)=>a[1].at-b[1].at).slice(0,objects.size-570))
            objects.delete(key);
        for(const [key,v] of movers)
            if(now-v.at>RETURN_MOVING_TTL)movers.delete(key);
        if(movers.size>100)for(const [key] of [...movers.entries()]
            .sort((a,b)=>a[1].at-b[1].at).slice(0,movers.size-70))
            movers.delete(key);
    }
    function returnObstacles(now=performance.now(),point=deathReturn.self) {
        const result=[];
        if(!point)return result;
        for(const o of deathReturn.objects.values())
            if(!RETURN_NAV_HAZARDS.has(o.type) && now-o.at<RETURN_MAP_TTL &&
                returnDist(o,point)<650)
                result.push({...o,radius:Math.max(8,o.radius+(o.navPad||0))});
        return result;
    }
    // Snapshot-driven risk zones are SOFT navigation costs, not permanent
    // blocked cells. This allows an escape when enemies surround the player.
    function returnRiskZones(now=performance.now(),point=deathReturn.self){
        if(!point)return [];
        const zones=[],selfSid=session.self?.sid,selfTeam=session.self?.team;
        for(const o of deathReturn.objects.values()){
            if(!RETURN_NAV_HAZARDS.has(o.type) || now-o.at>RETURN_MAP_TTL ||
               returnDist(o,point)>650)continue;
            const own=selfSid!==undefined && o.sid===selfSid;
            zones.push({x:o.x,y:o.y,radius:o.radius+25,
                weight:own?18:(o.type===9?200:160),at:o.at});
        }
        for(const o of deathReturn.movers.values()){
            if(now-o.at>RETURN_MOVING_TTL || returnDist(o,point)>490)continue;
            const predict=Math.min(180,Math.max(0,now-o.at)+85);
            const friendly=o.type===0 && selfTeam!==0 && o.team===selfTeam;
            zones.push({x:o.x+o.vx*predict,y:o.y+o.vy*predict,
                radius:o.radius+26,weight:o.type===0?(friendly?30:75):55,at:o.at});
        }
        return zones.sort((a,b)=>returnDist(a,point)-returnDist(b,point)).slice(0,18);
    }
    function returnRiskCost(p,zones){
        let penalty=0;
        for(const z of zones){
            const d=returnDist(p,z),outer=z.radius+48;
            if(d>=outer)continue;
            const proportion=(outer-d)/outer;
            penalty+=z.weight*proportion*proportion;
        }
        return Math.min(280,penalty);
    }
    function returnRiskOnSegment(a,b,zones){
        const dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy;
        for(const z of zones){
            if(z.weight<45)continue;
            const t=len2>0?Math.max(0,Math.min(1,
                ((z.x-a.x)*dx+(z.y-a.y)*dy)/len2)):0;
            if(Math.hypot(z.x-a.x-dx*t,z.y-a.y-dy*t)<z.radius+7)
                return true;
        }
        return false;
    }
    // Real movement is stronger evidence than a guessed hitbox radius.
    // Shrink only this observed object's navigation margin after walking close
    // to it; no globally permanent collision changes are learned.
    function returnLearnPassage(from,to,now){
        if(!from||!to || now-from.at>450 || now-from.at<0 ||
           returnDist(from,to)<10 || returnDist(from,to)>100 ||
           now-deathReturn.lastHitAt<550)return;
        const dx=to.x-from.x,dy=to.y-from.y,len2=dx*dx+dy*dy;
        for(const o of deathReturn.objects.values()){
            if(RETURN_NAV_HAZARDS.has(o.type) || now-o.at>RETURN_MAP_TTL ||
               returnDist(o,to)>180)continue;
            const t=Math.max(0,Math.min(1,
                ((o.x-from.x)*dx+(o.y-from.y)*dy)/len2));
            const d=Math.hypot(o.x-from.x-dx*t,o.y-from.y-dy*t);
            if(d<o.radius+18 && d>Math.max(0,o.radius-18))
                o.navPad=Math.max(-15,(o.navPad||0)-2);
        }
    }
    function returnLearnBlockingObstacle(from,to,now){
        if(now-deathReturn.lastHitAt<750)return;
        const dx=to.x-from.x,dy=to.y-from.y,len2=dx*dx+dy*dy;
        if(len2<1)return;
        let best=null,nearest=Infinity;
        for(const o of deathReturn.objects.values()){
            if(RETURN_NAV_HAZARDS.has(o.type) || now-o.at>RETURN_MAP_TTL)continue;
            const t=Math.max(0,Math.min(1,
                ((o.x-from.x)*dx+(o.y-from.y)*dy)/len2));
            const d=Math.hypot(o.x-from.x-dx*t,o.y-from.y-dy*t);
            const gap=returnDist(o,from)-o.radius;
            // A real stall occurs at the near edge of a collider, even when
            // the requested segment crosses its entire circle.
            if(t>0 && d<o.radius+22 && gap>=-8 && gap<55 && gap<nearest){
                best=o;nearest=gap;
            }
        }
        // Only a stable, observed stall can increase a local margin.
        if(best)best.navPad=Math.min(18,(best.navPad||0)+4);
    }
    // Navigation "radar": sweep a circle representing our player along the
    // intended movement segment. All coordinates come from server snapshots;
    // these are predicted collisions, not server-confirmed impacts.
    function returnFrontObstacle(from,to,obs,clearance=22){
        if(!from||!to||!Array.isArray(obs))return null;
        const dx=to.x-from.x,dy=to.y-from.y,length2=dx*dx+dy*dy;
        if(length2<1)return null;
        let nearest=null,closest=Infinity;
        for(const obj of obs){
            const t=((obj.x-from.x)*dx+(obj.y-from.y)*dy)/length2;
            if(t<0||t>1)continue;
            const x=from.x+t*dx,y=from.y+t*dy;
            const distance=Math.hypot(obj.x-x,obj.y-y);
            if(distance>obj.radius+clearance)continue;
            if(t<closest){closest=t;nearest=obj;}
        }
        return nearest;
    }
    const returnObstacleLabel=type=>({1:'pedra',2:'hard spike',3:'árvore',
        4:'ouro',5:'arbusto',7:'spike',8:'parede de madeira',13:'moinho',
        15:'cama',17:'castle spike',19:'fazenda',22:'castle wall',
        30:'baú',31:'parede grande',32:'parede média',33:'parede pequena'
    })[type]||`estrutura #${type}`;

    // Exact segment-vs-circle test for RETURN only: unlike the older per-7px
    // sampling loop, this costs one projection per obstacle and cannot skip a
    // narrow collision between samples. Spawn-bed geometry stays unchanged.
    function returnSegmentCollisionFree(a,b,obs,clearance){
        if(!a||!b || a.x<1 || a.y<1 || b.x<1 || b.y<1 ||
            a.x>65534 || a.y>65534 || b.x>65534 || b.y>65534)return false;
        const dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy;
        const minX=Math.min(a.x,b.x),maxX=Math.max(a.x,b.x);
        const minY=Math.min(a.y,b.y),maxY=Math.max(a.y,b.y);
        for(const o of obs){
            const r=o.radius+clearance+1;
            // AABB rejection avoids a projection for obstacles far away.
            if(o.x+r<minX || o.x-r>maxX || o.y+r<minY || o.y-r>maxY)continue;
            const projection=len2>0 ?
                Math.max(0,Math.min(1,((o.x-a.x)*dx+(o.y-a.y)*dy)/len2)) : 0;
            const ex=a.x+dx*projection-o.x,ey=a.y+dy*projection-o.y;
            if(ex*ex+ey*ey<r*r)return false;
        }
        return true;
    }
    function returnSegmentClear(a,b,obs,clearance=22){
        if(!a||!b)return false;
        if(returnSegmentCollisionFree(a,b,obs,clearance))return true;
        // Immediately after placing the bed, the player may be inside its
        // *estimated* collision circle even though the server accepted that
        // position. Allow ONLY short steps which continuously reduce total
        // penetration, just as spawn-bed navigation already does.
        if(!deathReturn.self || returnDist(a,deathReturn.self)>70 ||
            returnDist(b,deathReturn.self)>80)return false;
        const original=bedOverlap(a,obs,clearance);
        if(original<=0)return false;
        let previous=original;
        const count=Math.max(2,Math.ceil(returnDist(a,b)/5));
        for(let i=1;i<=count;i++){
            const factor=i/count;
            const p={x:a.x+(b.x-a.x)*factor,y:a.y+(b.y-a.y)*factor};
            const overlap=bedOverlap(p,obs,clearance);
            if(overlap>previous+0.6)return false;
            previous=overlap;
        }
        return previous<original-0.5;
    }
    // Never turn a single unconfirmed move into a permanent blocked corridor.
    // Bad edges are inferred from missing *forward* server progress, bounded
    // spatially and forgotten after a short TTL (structures can be destroyed).
    // Recent movement failures are temporary evidence; long-lived penalties
    // can make navigation deteriorate even after obstacles change.
    const RETURN_BLOCK_TTL=15000;
    function returnBadEdge(a,b,now=performance.now()){
        const vx=b.x-a.x,vy=b.y-a.y,mag=Math.hypot(vx,vy);
        if(mag<1)return false;
        for(const f of deathReturn.bad){
            if(now-f.at>RETURN_BLOCK_TTL)continue;
            const ux=f.to.x-f.from.x,uy=f.to.y-f.from.y,flen=Math.hypot(ux,uy);
            if(flen<1)continue;
            const similarity=(vx*ux+vy*uy)/(mag*flen);
            if(similarity<0.8)continue;
            const nearStart=returnDist(a,f.from)<30;
            const nearMiddle=returnDist(a,{
                x:(f.from.x+f.to.x)/2,y:(f.from.y+f.to.y)/2
            })<22;
            if(nearStart||nearMiddle)return true;
        }
        return false;
    }
    function markReturnBlocked(from,to,now=performance.now()){
        if(!from||!to)return;
        deathReturn.bad=deathReturn.bad.filter(f=>now-f.at<RETURN_BLOCK_TTL);
        if(!deathReturn.bad.some(f=>returnDist(f.from,from)<12 &&
            returnDist(f.to,to)<20))deathReturn.bad.push({from:{x:from.x,y:from.y},
                to:{x:to.x,y:to.y},at:now});
        if(deathReturn.bad.length>72)deathReturn.bad.splice(0,deathReturn.bad.length-72);
        deathReturn.detourSide*=-1;
        // A failed COMMAND does not invalidate the positions actually
        // observed. Once a detour succeeds, the entire real walked path can
        // still be replayed; only implausible position jumps invalidate it.
        deathReturn.repeatedPlans=0;
    }
    function returnLoopPenalty(point,start,now=performance.now()){
        let penalty=0;
        const sites=deathReturn.recentSites;
        // Old positions cannot keep contaminating a route indefinitely.
        // In particular, the player may revisit a useful corridor later.
        if(returnDist(point,start)<38)return 0;
        const horizon=9500;
        for(let i=0;i<sites.length-2;i++){
            const age=now-sites[i].at;
            if(age<0 || age>=horizon)continue;
            const d=returnDist(point,sites[i]);
            if(d<44){
                const freshness=Math.max(0.1,1-age/horizon);
                penalty=Math.max(penalty,(44-d)*2.4*
                    (0.35+0.65*i/sites.length)*freshness);
            }
        }
        return penalty;
    }

    function returnTrimTrail(trail,start,goal,obs,risk=[]) {
        if(!Array.isArray(trail)||trail.length<2||!start||!goal)return null;
        let first=-1,best=125;
        for(let i=0;i<trail.length;i++){
            const d=returnDist(start,trail[i]);
            if(d<best){best=d;first=i;}
        }
        if(first<0 || returnDist(trail.at(-1),goal)>115)return null;
        const tail=trail.slice(first).map(p=>({x:p.x,y:p.y}));
        tail.push({x:goal.x,y:goal.y});
        const points=[],src={x:start.x,y:start.y};
        // Keep actual recorded turns if they cannot be safely skipped.
        let at=src,idx=0;
        while(idx<tail.length&&points.length<190){
            let end=idx;
            for(let j=Math.min(tail.length-1,idx+17);j>=idx;j--){
                if(returnSegmentClear(at,tail[j],obs,16)&&
                   !returnRiskOnSegment(at,tail[j],risk)&&
                   !returnBadEdge(at,tail[j])){end=j;break;}
            }
            const next=tail[end];
            if(returnBadEdge(at,next)||!returnSegmentClear(at,next,obs,10)||
               returnRiskOnSegment(at,next,risk))return null;
            if(returnDist(at,next)>RETURN_WAYPOINT)points.push(next);
            at=next;idx=end+1;
        }
        if(returnDist(at,goal)>RETURN_ARRIVED)points.push({x:goal.x,y:goal.y});
        return points.length?points:null;
    }
    // Choose an actual side of the first mapped barrier as a local planning
    // goal. A* aiming ONLY at the point immediately behind a wall can choose
    // the same nearest cell forever and oscillate there (local minimum).
    function returnDetourGoal(start,end,obstacles,clearance=22) {
        const wall=returnFrontObstacle(start,end,obstacles,clearance);
        if(!wall)return null;
        const dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy);
        if(length<1)return null;
        const ux=dx/length,uy=dy/length;
        const lateral=wall.radius+clearance+24;
        const forward=Math.min(95,wall.radius+clearance+18);
        let choice=null,best=Infinity;
        for(const side of [-1,1]){
            const point={x:wall.x+ux*forward-side*uy*lateral,
                         y:wall.y+uy*forward+side*ux*lateral};
            if(!bedPointFree(point.x,point.y,obstacles,clearance))continue;
            // Prefer a side that is already reachable, then the one that
            // preserves more direct progress. Avoid previously failed legs.
            const lineClear=returnSegmentClear(start,point,obstacles,clearance);
            const score=returnDist(point,end)+returnLoopPenalty(point,start)+
                returnRiskCost(point,returnRiskZones(performance.now(),start))+
                (lineClear?0:65)+(returnBadEdge(start,point)?480:0)+
                (side===deathReturn.detourSide?-20:20);
            if(score<best){best=score;choice=point;}
        }
        return choice;
    }
    // Local A* with a moving planning window. For distant deaths, plan a
    // partial segment toward the target, then replan as the player progresses.
    function routeToReturnGoal(now,clearance=22) {
        const start=deathReturn.self,goal=deathReturn.target;
        if(!start||!goal)return null;
        const obs=returnObstacles(now,start),risk=returnRiskZones(now,start),
            distance=returnDist(start,goal);
        if(distance<=RETURN_ARRIVED)return [];
        const heading=Math.atan2(goal.y-start.y,goal.x-start.x);
        // Local planner may see a longer corridor, but each *actual* move is
        // short enough to validate with fresh server snapshots.
        const horizon=Math.min(distance,240);
        const intermediate=distance<=240?goal:{
            x:start.x+Math.cos(heading)*horizon,y:start.y+Math.sin(heading)*horizon};
        const shortLeg=distance<=80?goal:{
            x:start.x+Math.cos(heading)*80,y:start.y+Math.sin(heading)*80};
        if(returnSegmentClear(start,shortLeg,obs,clearance)&&
            !returnRiskOnSegment(start,shortLeg,risk) &&
            !returnBadEdge(start,shortLeg) &&
            (!returnFrontObstacle(start,intermediate,obs,clearance) ||
                returnDist(start,returnFrontObstacle(start,intermediate,obs,clearance))>110))
            return [shortLeg];
        // Target a point alongside a detected obstacle instead of repeatedly
        // selecting the closest unreachable cell directly behind it.
        const detour=returnDetourGoal(start,intermediate,obs,clearance);
        const planGoal=detour || intermediate;
        const cell=17,N=37,mid=18,count=N*N;
        const coords=id=>({x:start.x+((id%N)-mid)*cell,
                           y:start.y+(Math.floor(id/N)-mid)*cell});
        const origin=mid*N+mid;
        const bestScore=new Float64Array(count).fill(Infinity),parents=new Int32Array(count).fill(-1);
        // Min-heap priority queue instead of scanning every open candidate.
        const closed=new Uint8Array(count),open=[];bestScore[origin]=0;
        function pushNode(id,score){
            let i=open.length;open.push({id,score});
            while(i>0){
                const p=(i-1)>>1;
                if(open[p].score<=score)break;
                open[i]=open[p];i=p;
            }
            open[i]={id,score};
        }
        function popNode(){
            const result=open[0],last=open.pop();
            if(open.length){
                let i=0;
                while(true){
                    const child=i*2+1;
                    if(child>=open.length)break;
                    let next=child;
                    if(child+1<open.length && open[child+1].score<open[child].score)
                        next=child+1;
                    if(last.score<=open[next].score)break;
                    open[i]=open[next];i=next;
                }
                open[i]=last;
            }
            return result.id;
        }
        pushNode(origin,returnDist(start,planGoal));
        let best=origin,bestHeuristic=Infinity,iterations=0;
        let reached=false;
        while(open.length && iterations++<2600){
            const atId=popNode();
            if(closed[atId])continue;closed[atId]=1;
            const at=atId===origin?start:coords(atId);
            const h=returnDist(at,planGoal);
            // A local minimum can require moving sideways or temporarily away
            // from the goal. Score *reachable* cells using loop memory too.
            const candidate=h+0.18*bestScore[atId]+returnLoopPenalty(at,start);
            if(atId!==origin && returnDist(at,start)>32 && candidate<bestHeuristic){
                bestHeuristic=candidate;best=atId;
            }
            if(h<=cell*1.35){best=atId;reached=true;break;}
            for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
                const x=atId%N+dx,y=Math.floor(atId/N)+dy;
                if(x<0||y<0||x>=N||y>=N)continue;
                const id=y*N+x;if(closed[id])continue;
                const p=coords(id);
                if(!returnSegmentClear(at,p,obs,clearance)||returnBadEdge(at,p))continue;
                const next=bestScore[atId]+Math.hypot(dx,dy)*cell+
                    returnLoopPenalty(p,start)*0.11+returnRiskCost(p,risk);
                if(next<bestScore[id]){
                    bestScore[id]=next;parents[id]=atId;
                    pushNode(id,next+returnDist(p,planGoal));
                }
            }
        }
        // An unreachable local goal may have a valid side route that moves
        // *away* from the goal at first. Do not reject that outright; repeated
        // waypoints are penalized and failed segments are temporarily blocked.
        if(best===origin)return null;
        const path=[],seen=new Set();let id=best;
        while(id!==origin&&id>=0&&!seen.has(id)&&path.length<=count){
            seen.add(id);path.unshift(coords(id));id=parents[id];
        }
        if(!path.length||id!==origin)return null;
        const smoothed=[],from={x:start.x,y:start.y};
        let current=from,idx=0;
        while(idx<path.length){
            let j=path.length-1;
            for(;j>idx;j--)if(returnSegmentClear(current,path[j],obs,clearance)&&
                    !returnRiskOnSegment(current,path[j],risk)&&
                    !returnBadEdge(current,path[j]))break;
            const p=path[j];smoothed.push(p);current=p;idx=j+1;
        }
        // Recheck only the next short part after each real movement. This
        // prevents blindly driving through walls at the far end of a long leg.
        if(smoothed.length){
            const first=smoothed[0],d=returnDist(start,first);
            if(d>82)smoothed[0]={x:start.x+(first.x-start.x)*82/d,
                y:start.y+(first.y-start.y)*82/d};
        }
        return smoothed;
    }
    function returnLayoutSimilar(a,b){
        if(a===b)return true;
        const A=decodeBedLayout(a),B=decodeBedLayout(b);
        if(!A||!B||A.length!==B.length)return false;
        const used=new Set();let total=0;
        for(const x of A){
            let best=-1,dist=Infinity;
            for(let i=0;i<B.length;i++){
                const y=B[i];if(used.has(i)||x[0]!==y[0])continue;
                const d=Math.hypot(x[1]-y[1],x[2]-y[2]);
                if(d<dist){dist=d;best=i;}
            }
            if(best<0||dist>1.3)return false;
            used.add(best);total+=dist;
        }
        return total<=Math.max(1.25,A.length*0.45);
    }
    function replayReturnPath(now){
        const start=deathReturn.self,goal=deathReturn.target;
        if(!start||!goal||!bed.origin)return null;
        const layout=deathReturn.spawnLayout||'clear',socket=deathReturn.server;
        const obs=returnObstacles(now,start);
        for(const r of returnPaths){
            if(r.socket!==socket||!returnLayoutSimilar(r.layout,layout)||
                returnDist(r.spawn,bed.origin)>65||
                returnDist(r.goal,goal)>60)continue;
            const route=returnTrimTrail(r.path,start,goal,obs,
                returnRiskZones(now,start));
            if(route)return route;
        }
        return null;
    }
    function saveSuccessfulReturn(){
        const evidence=deathReturn.verifiedPath;
        if(!deathReturn.learningClean || !deathReturn.target || !bed.origin ||
            evidence.length<3 || returnDist(evidence[0],bed.origin)>125 ||
            returnDist(evidence.at(-1),deathReturn.target)>RETURN_ARRIVED+12)return;
        const layout=deathReturn.spawnLayout||'clear',socket=deathReturn.server;
        if(!socket)return;
        const path=evidence.map(p=>({x:p.x,y:p.y}));
        if(path.length>160){
            const step=Math.ceil(path.length/155);
            const sampled=path.filter((_,i)=>i%step===0);
            sampled.push(path.at(-1));path.splice(0,path.length,...sampled);
        }
        const record={socket,layout,validated:2,
            spawn:{x:bed.origin.x,y:bed.origin.y},
            goal:{x:deathReturn.target.x,y:deathReturn.target.y},path};
        for(let i=returnPaths.length-1;i>=0;i--)
            if(returnPaths[i].socket===socket && returnPaths[i].layout===layout &&
                returnDist(returnPaths[i].goal,record.goal)<65)returnPaths.splice(i,1);
        returnPaths.unshift(record);if(returnPaths.length>8)returnPaths.length=8;
        saveReturnPaths();deathReturn.learned=true;
    }
    function beginReturnIfReady(now=performance.now()){
        if(!settings.returnAfterBed||!deathReturn.target||!player.alive||
            deathReturn.phase!=='waiting' || !bed.confirmed ||
            !settings.autoSpawnBed || !bed.self ||
            deathReturn.socketEpoch!==session.connectionEpoch)return false;
        deathReturn.spawnLayout=bedLayoutSignature(now)||'clear';
        deathReturn.phase='ready';deathReturn.startedAt=now;
        // Start on the same entity snapshot that confirms the new bed. The
        // former 60ms delay could leave a stationary player waiting indefinitely
        // if no additional world packet arrived in that interval.
        deathReturn.nextAt=now;deathReturn.attempted=0;
        deathReturn.route=[];deathReturn.step=0;deathReturn.trace=[];
        deathReturn.learned=false;deathReturn.driftSamples=0;
        deathReturn.verifiedPath=deathReturn.self ?
            [{x:deathReturn.self.x,y:deathReturn.self.y}] : [];
        deathReturn.learningClean=true;
        deathReturn.status='Calculando retorno';
        return true;
    }
    function returnCanMove(now){
        return player.alive && connected() && settings.returnAfterBed &&
            deathReturn.target && bed.confirmed && !bed.pending &&
            deathReturn.socketEpoch===session.connectionEpoch &&
            deathReturn.self && now-deathReturn.self.at<=RETURN_SNAPSHOT_TTL &&
            !deathReturn.manualMove && !bed.locked && !bed.handoffMove &&
            // Food selection/attack does not own the movement channel.
            // Waiting for a quiet healing phase can starve the return when
            // rapid healing stays busy for most of a fight.
            !ageRecovery.pending && !macro.selected &&
            !Object.keys(macroDefs).some(macroActive) &&
            !ap.manualItem && session.ws.bufferedAmount<2048;
    }
    function returnMoveTo(point,now){
        const self=deathReturn.self;
        if(!point||!self)return false;
        if(returnDist(self,point)<=RETURN_WAYPOINT){deathReturn.step++;return true;}
        const angle=Math.atan2(point.y-self.y,point.x-self.x);
        if(!transmit([1,...apAngleBytes(angle)]))return false;
        deathReturn.moveFrom={x:self.x,y:self.y};deathReturn.moveTo=point;
        deathReturn.moveAt=now;deathReturn.lastMovedAt=now;
        deathReturn.lastMovedPos={x:self.x,y:self.y};deathReturn.moveOwned=true;
        deathReturn.observedAt=self.at;deathReturn.forwardBest=0;
        deathReturn.progressSamples=0;
        deathReturn.attempted++;deathReturn.phase='moving';
        const epoch=deathReturn.epoch,revision=++deathReturn.moveRevision;
        // Fresh snapshots make the collision decision. This timer only
        // guards against an endlessly held movement command during a stall.
        // It must NOT throw away a route that has made real progress.
        const baseline=Math.max(35,Math.min(250,lag.baselineMs||70));
        const deadline=Math.max(470,Math.min(1350,
            returnDist(self,point)/Math.max(0.12,deathReturn.observedSpeed)+
            Math.max(165,baseline*2.2)));
        deathReturn.moveTimer=setTimeout(()=>{
            if(deathReturn.epoch===epoch&&deathReturn.moveRevision===revision&&
                deathReturn.moveOwned && deathReturn.phase==='moving'){
                const fresh=deathReturn.self && deathReturn.self.at>deathReturn.moveAt;
                const from=deathReturn.moveFrom,to=deathReturn.moveTo;
                const dx=to&&from ? to.x-from.x : 0;
                const dy=to&&from ? to.y-from.y : 0;
                const length=Math.hypot(dx,dy);
                const progress=fresh && from && length>0 ?
                    Math.max(0,((deathReturn.self.x-from.x)*dx+
                    (deathReturn.self.y-from.y)*dy)/length) : 0;
                stopReturnMovement();deathReturn.phase='ready';
                // Re-issue the unfinished waypoint from the new observed
                // position; no full A* search just because a timer elapsed.
                // Timer expiry is NOT a wall. Without a fresh snapshot,
                // preserve the planned route and wait for server evidence.
                if(fresh && progress<9){
                    deathReturn.route=[];deathReturn.step=0;
                }
                deathReturn.nextAt=performance.now()+8;
                deathReturn.status=!fresh ? 'Aguardando posição atualizada' :
                    progress>=9 ? 'Continuando trajeto confirmado' :
                    'Verificando avanço do servidor';
            }
        },deadline);
        return true;
    }
    // Spin all selected items, not just weapons. Keep native aim separately
    // for explicit macro/bed actions; spin never selects, places or attacks.
    function resetSpin(){
        spin.lastSentAt=-Infinity;spin.lastAt=null;spin.angle=0;spin.aim=null;
    }
    function spinCanAim(now){
        return settings.returnSpin && player.alive && connected() &&
            session.self && now-session.self.at<=RETURN_SNAPSHOT_TTL &&
            !(bed.pending && bed.phase==='placing') && !ageRecovery.pending &&
            heal.phase==='idle' && !heal.foodSelected &&
            !(isEligible() && now>=heal.nextAt) &&
            !macro.selected && !Object.keys(macroDefs).some(macroActive) &&
            session.ws.bufferedAmount<2048;
    }
    function advanceSpin(now){
        // Keep phase continuous through short interruptions, without replaying
        // missed packets. Very long browser suspension restarts from last angle.
        if(spin.lastAt===null){
            const initial=session.nativeAim || session.serverAim;
            if(initial)spin.angle=((initial[0]+256*initial[1])*360/65535-180+360)%360;
        }else{
            const elapsed=Math.max(0,Math.min(250,now-spin.lastAt));
            spin.angle=(spin.angle+((settings.spinDegreesPerSecond/1000)*elapsed)%360)%360;
        }
        spin.lastAt=now;
        spin.aim=apAngleBytes(spin.angle*Math.PI/180);
        return spin.aim;
    }
    function driveSpin(now=performance.now()){
        if(!settings.returnSpin || !player.alive)return false;
        if(!spinCanAim(now))return false;
        // Allow small frame-clock jitter without skipping every other 60 Hz
        // frame. The single timestamp also deduplicates timer/socket wakes.
        if(now-spin.lastSentAt<SPIN_INTERVAL_MS-0.75)return true;
        const aim=advanceSpin(now);
        if(!transmit([13,...aim]))return false;
        spin.lastSentAt=now;return true;
    }
    function driveReturn(now=performance.now()){
        if(!settings.returnAfterBed||!player.alive||
            deathReturn.socketEpoch!==session.connectionEpoch)return;
        if(!deathReturn.target){
            if(deathReturn.phase==='waiting')deathReturn.status='Sem posição da morte nesta vida';
            return;
        }
        beginReturnIfReady(now);
        if(deathReturn.phase==='waiting'){
            if(!bed.confirmed && bed.phase==='retry')deathReturn.status='Retorno: aguardando nova tentativa da cama';
            else if(!bed.confirmed && !bed.pending)deathReturn.status='Retorno pausado: cama não confirmada';
            else if(!bed.confirmed && !bed.unlocked)deathReturn.status='Retorno: aguardando item cama';
            return;
        }
        if(!['moving','ready','arrived'].includes(deathReturn.phase))return;
        // Arrival is NOT terminal. Continue observing server-confirmed position
        // every snapshot, including when the page is hidden.
        if(!deathReturn.self || now-deathReturn.self.at>RETURN_SNAPSHOT_TTL)return;
        const distance=returnDist(deathReturn.self,deathReturn.target);
        const lookingAt=deathReturn.phase==='moving' && deathReturn.moveTo ?
            deathReturn.moveTo:deathReturn.target;
        deathReturn.frontObstacle=returnFrontObstacle(deathReturn.self,lookingAt,
            returnObstacles(now,deathReturn.self),19);
        if(deathReturn.phase==='arrived'){
            const recentHit=now-deathReturn.lastHitAt<=750;
            const displaced=distance>RETURN_REENGAGE ||
                (recentHit && distance>RETURN_ARRIVED+4);
            if(!displaced){
                deathReturn.driftSamples=0;
                deathReturn.status='Fixado no local da morte';
                return;
            }
            // No extra snapshot required: server position itself confirms
            // the displacement. The ARRIVED/REENGAGE gap handles jitter.
            deathReturn.driftSamples=0;
            deathReturn.phase='ready';deathReturn.startedAt=now;
            deathReturn.attempted=0;deathReturn.fails=0;
            deathReturn.route=[];deathReturn.step=0;
            deathReturn.trace=[];deathReturn.nextAt=now;
            deathReturn.verifiedPath=[{x:deathReturn.self.x,y:deathReturn.self.y}];
            deathReturn.learningClean=true;
            deathReturn.lastPlanSignature='';deathReturn.repeatedPlans=0;
        deathReturn.lastPlanOrigin=null;deathReturn.lastPlanAt=0;
            deathReturn.status='Fora do ponto: retornando';
        }
        // A temporary failure is not a feature shutdown. Retry at a bounded
        // cadence while this life is active and the setting is enabled.
        if(now-deathReturn.startedAt>RETURN_MAX_TIME||deathReturn.attempted>RETURN_MAX_STEPS){
            stopReturnMovement();deathReturn.phase='ready';
            deathReturn.startedAt=now;deathReturn.attempted=0;
            deathReturn.fails=0;
            deathReturn.route=[];deathReturn.step=0;
            deathReturn.nextAt=now+350;
            deathReturn.status='Recalculando rota após limite';return;
        }
        if(distance<=RETURN_ARRIVED){
            if(deathReturn.learningClean &&
                (!deathReturn.verifiedPath.length ||
                 returnDist(deathReturn.verifiedPath.at(-1),deathReturn.self)>2))
                deathReturn.verifiedPath.push({x:deathReturn.self.x,y:deathReturn.self.y});
            stopReturnMovement();deathReturn.phase='arrived';
            deathReturn.driftSamples=0;deathReturn.arrivals++;
            deathReturn.status='Fixado no local da morte';
            saveSuccessfulReturn();return;
        }
        if(deathReturn.phase==='moving'){
            const at=deathReturn.self,to=deathReturn.moveTo;
            const from=deathReturn.moveFrom;
            if(!to||!from)return;
            const leg=returnDist(from,to);
            const ux=(to.x-from.x)/Math.max(1,leg),
                uy=(to.y-from.y)/Math.max(1,leg);
            const forward=(at.x-from.x)*ux+(at.y-from.y)*uy;
            const lateral=Math.abs((at.x-from.x)*uy-(at.y-from.y)*ux);
            const fresh=at.at>deathReturn.observedAt+1 && at.at>deathReturn.moveAt+10;
            if(fresh){
                deathReturn.observedAt=at.at;
                deathReturn.progressSamples++;
                // Progress must be ALONG the requested direction. A collision
                // sliding the character sideways cannot reset the stall clock.
                if(forward>deathReturn.forwardBest+3){
                    deathReturn.forwardBest=forward;
                    deathReturn.lastMovedAt=now;
                    deathReturn.lastMovedPos={x:at.x,y:at.y};
                    const v=forward/Math.max(1,now-deathReturn.moveAt);
                    if(v>0.05&&v<1.2)deathReturn.observedSpeed=
                        deathReturn.observedSpeed*0.75+v*0.25;
                    // The position recorder captures every actual movement,
                    // including legitimate sideways detours; no synthetic
                    // waypoint is added to the learned path here.
                }
            }
            if(returnDist(at,to)<=RETURN_WAYPOINT || forward>=leg-RETURN_WAYPOINT){
                stopReturnMovement();deathReturn.step++;
                deathReturn.phase='ready';deathReturn.nextAt=now+1;
            } else {
                // React on two fresh snapshots; avoid timing out during
                // a one-off high-latency frame.
                const stallLimit=Math.max(200,Math.min(440,
                    (lag.baselineMs||70)*2.7));
                // Under a lag spike, delayed position snapshots are not
                // evidence of a wall. Require stable packet cadence before
                // learning negative edges, so an idle background tab does
                // not poison the route archive.
                const cadenceStable=!settings.lagGuard ||
                    (networkState(now)==='OK' && lag.stableTicks>=2);
                const stalled=cadenceStable && deathReturn.progressSamples>=3 &&
                    now-deathReturn.lastMovedAt>stallLimit;
                const pushedOffCourse=cadenceStable && fresh && lateral>42 &&
                    forward<leg*0.35;
                if(stalled || pushedOffCourse){
                    // A passing player or a recent hit cannot establish that a
                    // corridor is permanently blocked by a wall.
                    const temporaryRisk=now-deathReturn.lastHitAt<750 ||
                        returnRiskOnSegment(at,to,returnRiskZones(now,at));
                    if(stalled && !temporaryRisk)
                        returnLearnBlockingObstacle(at,to,now);
                    // The blocked segment begins at the last *observed*
                    // position, not the theoretical route's first waypoint.
                    if(!temporaryRisk)markReturnBlocked({x:at.x,y:at.y},to,now);
                    stopReturnMovement();deathReturn.fails++;
                    deathReturn.route=[];deathReturn.step=0;
                    deathReturn.phase='ready';deathReturn.nextAt=now+20;
                    deathReturn.status=stalled?'Bloqueio confirmado pelo movimento':
                        'Desvio lateral detectado';
                } else return;
            }
        }
        if(now<deathReturn.nextAt)return;
        if(!returnCanMove(now)){
            // Expose the *real* reason instead of silently doing nothing.
            if(bed.locked)deathReturn.status='Aguardando liberar controles da cama';
            else if(bed.handoffMove||deathReturn.manualMove)deathReturn.status='Aguardando fim de movimento manual';
            else if(heal.phase!=='idle')deathReturn.status='Aguardando cura';
            else if(macro.selected || Object.keys(macroDefs).some(macroActive))
                deathReturn.status='Aguardando macro manual';
            else if(ap.manualItem)deathReturn.status='Aguardando troca manual de item';
            else if(session.ws && session.ws.bufferedAmount>=2048)
                deathReturn.status='Aguardando fila WebSocket';
            else deathReturn.status='Aguardando nova posição do servidor';
            return;
        }
        if(deathReturn.route.length && deathReturn.step>=deathReturn.route.length)
            deathReturn.route=[];
        if(!deathReturn.route.length){
            const obstacles=returnObstacles(now,deathReturn.self);
            let route=null;deathReturn.usedRecorded=false;
            // A knockback usually leaves the original point directly nearby.
            // Short unobstructed corrections should not wait for a full A*.
            if(distance<=165 && returnSegmentClear(deathReturn.self,
                    deathReturn.target,obstacles,15) &&
                !returnRiskOnSegment(deathReturn.self,deathReturn.target,
                    returnRiskZones(now,deathReturn.self)) &&
                !returnBadEdge(deathReturn.self,deathReturn.target)) {
                route=[{x:deathReturn.target.x,y:deathReturn.target.y}];
            }
            if(!route && !deathReturn.fails){
                route=replayReturnPath(now)||returnTrimTrail(deathReturn.recorded,
                    deathReturn.self,deathReturn.target,obstacles,
                    returnRiskZones(now,deathReturn.self));
                deathReturn.usedRecorded=!!route;
            }
            if(!route)for(const clearance of [26,20,15]){
                route=routeToReturnGoal(now,clearance);
                if(route!==null)break;
            }
            if(!route||!route.length){
                deathReturn.fails++;
                deathReturn.nextAt=now+100;
                deathReturn.status='Procurando passagem';
                if(deathReturn.fails>20){
                    deathReturn.fails=0;
                    deathReturn.nextAt=now+450;
                    deathReturn.status='Sem passagem; mantendo bloqueios aprendidos';
                }
                return;
            }
            const sig=route.slice(0,2).map(p=>
                `${Math.round(p.x/18)},${Math.round(p.y/18)}`).join('|');
            const planOrigin=deathReturn.lastPlanOrigin;
            // Reusing the same waypoint while MOVING FORWARD is a healthy
            // continuation, not an infinite loop. Only count re-plans made
            // from practically the same place within a short time window.
            const sameUnmovingStart=!!planOrigin &&
                returnDist(planOrigin,deathReturn.self)<11 &&
                now-deathReturn.lastPlanAt<2600;
            if(sig===deathReturn.lastPlanSignature && sameUnmovingStart)
                deathReturn.repeatedPlans++;
            else deathReturn.repeatedPlans=0;
            deathReturn.lastPlanSignature=sig;
            deathReturn.lastPlanOrigin={x:deathReturn.self.x,y:deathReturn.self.y};
            deathReturn.lastPlanAt=now;
            if(deathReturn.repeatedPlans>3){
                // The same plan in a loop is not progress. Switch side and
                // penalize it temporarily; other corridors stay available.
                markReturnBlocked(deathReturn.self,route[0],now);
                deathReturn.repeatedPlans=0;
                deathReturn.nextAt=now+35;
                deathReturn.status='Quebrando ciclo de rota';return;
            }
            deathReturn.route=route;deathReturn.step=0;
            deathReturn.status=deathReturn.usedRecorded?'Seguindo rota validada':'A* com memória de obstáculos';
        }
        const waypoint=deathReturn.route[deathReturn.step];
        if(!waypoint){deathReturn.route=[];deathReturn.nextAt=now+5;return;}
        const obstacles=returnObstacles(now,deathReturn.self);
        if(!returnSegmentClear(deathReturn.self,waypoint,obstacles,15)||
            returnBadEdge(deathReturn.self,waypoint)){
            deathReturn.route=[];deathReturn.nextAt=now+10;return;
        }
        returnMoveTo(waypoint,now);
    }

    function noteBedInventory(packet) {
        if (packet instanceof Uint8Array && packet[0]===2 &&
            packet.subarray(1).includes(SPAWN_BED_ID)) {
            if (player.alive) {
                if (bed.pending && bed.socketEpoch===session.connectionEpoch)
                    bed.unlocked=true;
            } else bed.preSpawnUnlockAt=performance.now();
        }
    }
    function observeSpawnBed(packet,now=performance.now()) {
        if (!(packet instanceof Uint8Array) || (packet.length-1)%19!==0 ||
            !player.alive || !bed.pending) return;
        let self=null;
        for (let i=1;i+18<packet.length;i+=19) {
            if (packet[i]!==0 || (packet[i+8]&2) ||
                (packet[i+2]|packet[i+3]<<8)!==player.id) continue;
            self={x:packet[i+4]|packet[i+5]<<8,
                  y:packet[i+6]|packet[i+7]<<8,at:now};
            bed.sid=packet[i+1];
            break;
        }
        if (self) {
            if(bed.socketEpoch!==session.connectionEpoch ||
               now<bed.spawnAt)return;
            bed.seenSnapshots++;
            bed.self=self;
            if(!bed.origin) {
                const candidate=bed.spawnCandidate;
                if(!candidate || now-candidate.at>BED_ORIGIN_CONFIRM_GAP ||
                   bedDistance(candidate,self)>BED_ORIGIN_MAX_DRIFT) {
                    bed.spawnCandidate={x:self.x,y:self.y,at:now};
                    bed.spawnCandidateCount=1;
                } else if(++bed.spawnCandidateCount>=2) {
                    bed.origin={x:candidate.x,y:candidate.y,at:now};
                    bed.spawnAnchorConfirmed=true;
                }
            }
            if (bed.locked && bed.origin && bed.pending) rememberBedMovement(self);
        }
        // Pre-anchor bed entities may arrive only once in incremental updates.
        if(bed.sid!==null)for(let i=1;i+18<packet.length;i+=19) {
            if(packet[i]!==SPAWN_BED_ENTITY_TYPE || packet[i+1]!==bed.sid)continue;
            const key=packet[i+1]+':'+packet[i]+':'+
                (packet[i+2]|packet[i+3]<<8);
            if(packet[i+8]&2){bed.earlyBeds.delete(key);continue;}
            bed.earlyBeds.set(key,{x:packet[i+4]|packet[i+5]<<8,
                y:packet[i+6]|packet[i+7]<<8,at:now});
        }
        if (!bed.origin || bed.sid===null || !bed.spawnAnchorConfirmed)return;
        if(bed.tries===0 && bed.lastAt===0) {
            for(const existing of bed.earlyBeds.values()) {
                if(now-existing.at>3000 ||
                   bedDistance(existing,bed.origin)>BED_POSITION_TOLERANCE)continue;
                // An existing own bed at this fresh spawn requires no travel.
                stopBedMovement(true,bed.locked);
                bed.pending=false;bed.confirmed=true;bed.phase='existing';
                bed.route=[];bed.waypoint=0;bed.moveTo=null;
                releaseBedInput();
                if(settings.returnAfterBed && deathReturn.target)
                    beginReturnIfReady(now);
                return;
            }
        }
        for (let i=1;i+18<packet.length;i+=19) {
            const type=packet[i],id=packet[i+2]|packet[i+3]<<8;
            const key=packet[i+1]+':'+type+':'+id;
            if (packet[i+8]&2) {bed.nearby.delete(key);continue;}
            if (type===0 && id===player.id) continue;
            const x=packet[i+4]|packet[i+5]<<8,y=packet[i+6]|packet[i+7]<<8;
            if (Math.hypot(x-bed.origin.x,y-bed.origin.y)>270) continue;
            bed.nearby.set(key,{type,x,y,at:now,sid:packet[i+1]});
            if (type===SPAWN_BED_ENTITY_TYPE && bed.tries===0 && bed.lastAt===0)
                bed.knownBedIds.add(key);
            if (type===SPAWN_BED_ENTITY_TYPE && packet[i+1]===bed.sid &&
                !bed.knownBedIds.has(key) &&
                Math.hypot(x-bed.origin.x,y-bed.origin.y)<=BED_POSITION_TOLERANCE &&
                bed.lastAt>0) {
                // Server confirmed the new bed: STOP immediately, even when
                // moveOwned is already false. Release WASD before learning or
                // writing to storage, which can take additional time.
                // A manual key may already be held after early unlock.
                // Never override that movement with a late confirmation STOP.
                stopBedMovement(true,bed.locked);
                bed.pending=false;bed.confirmed=true;bed.phase='done';
                bed.route=[];bed.waypoint=0;bed.moveTo=null;
                releaseBedInput();
                rememberBedSuccess({x,y},now); // Learn only after server confirmation.
                // Early input release in 1.8.18 could leave a synthetic WASD
                // handoff active permanently. The opted-in return owns movement
                // once this bed is confirmed; clear that stale handoff.
                if(settings.returnAfterBed && deathReturn.target){
                    if(bed.handoffMove){transmit([15]);bed.handoffMove=false;}
                    bed.manualAfterPlacement=false;
                    bed.moveKeys.clear();
                    beginReturnIfReady(now);
                }
                return;
            }
        }
        for (const [key,obj] of bed.nearby)
            if (now-obj.at>BED_NEARBY_TTL) bed.nearby.delete(key);
        // Bounded cache for crowded servers. Keep recently observed entries;
        // do not evict a nearby wall merely because it was not updated this tick.
        if(bed.nearby.size>480){
            const oldest=[...bed.nearby.entries()].sort((a,b)=>a[1].at-b[1].at);
            for(const [key] of oldest.slice(0,bed.nearby.size-400))bed.nearby.delete(key);
        }
        bedPromoteLayout(now);
    }
    // 1.8.11: Respawn-bed navigation. Obstacles are read from the game's 19-byte
    // entity snapshots; estimated radii are cross-checked with public client
    // data. Path finding never changes the target: the first spawn coordinate.
    // Radii are approximate, so an observed server position always wins.
    // Network entity *types* are not inventory item IDs. The former map
    // mistakenly assigned radius 0 to type 8 (WOODWALL), so A* routed through
    // walls and learned invalid paths. These radii follow the public entity
    // layer table. Radii are estimates, NOT authoritative collision flags.
    const BED_ENTITY_RADII={
        0:35,1:75,2:45,3:90,4:76,5:50,6:40,7:45,8:45,9:60,
        10:40,11:40,12:0,13:45,14:90,15:50,16:54,17:42,18:45,
        19:80,20:80,21:60,22:59,23:90,24:50,25:90,26:50,
        27:100,28:90,29:100,30:45,31:92,32:92,33:58,34:92,
        35:20,36:20,37:35,38:50,39:220
    };
    // Moving entities are not stationary walls; temporary players and animals
    // appearing in snapshots used to make the plan change on every update.
    // Platforms/projectiles/boosts do not define walls for walking.
    const BED_NAV_DYNAMIC=new Set([0,14,23,24,25,27,28,29,36,39]);
    // Trap is walked onto to trigger it (not a hard wall). Roof is an overhead
    // entity. Do not make impassable A* cells out of these objects.
    const BED_NAV_PASSABLE=new Set([6,9,10,12,26]);
    const bedBlocksMovement=type=>
        !BED_NAV_DYNAMIC.has(type) && !BED_NAV_PASSABLE.has(type) &&
        (BED_ENTITY_RADII[type]??0)>0;
    const bedDistance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
    function bedObstacles(now=performance.now()) {
        const items=[];
        for(const obj of bed.nearby.values()) {
            if (now-obj.at>BED_NEARBY_TTL || !bedBlocksMovement(obj.type)) continue;
            const radius=BED_ENTITY_RADII[obj.type];
            items.push({x:obj.x,y:obj.y,radius,type:obj.type});
        }
        return items;
    }
    function bedPointFree(x,y,objects,bodyRadius=BED_NAV_BODY) {
        if (x<1 || y<1 || x>65534 || y>65534) return false;
        for(const obj of objects) {
            if (Math.hypot(x-obj.x,y-obj.y)<obj.radius+bodyRadius+1) return false;
        }
        return true;
    }
    function bedSegmentFree(from,to,objects,bodyRadius=BED_NAV_BODY) {
        const dist=bedDistance(from,to);
        const count=Math.max(1,Math.ceil(dist/7));
        for(let i=1;i<=count;i++) {
            const t=i/count;
            if(!bedPointFree(from.x+(to.x-from.x)*t,
                from.y+(to.y-from.y)*t,objects,bodyRadius)) return false;
        }
        return true;
    }
    // The client only gives estimated collider sizes. A wall touching the
    // projected bed outline is NOT proof the server will reject the build.
    // Reject only a hard obstruction through the *center*; let the server
    // confirm or reject borderline placements.
    function bedOriginFree(objects) {
        return bedPointFree(bed.origin.x,bed.origin.y,objects,0);
    }
    function bedReadyToPlace(objects) {
        if(!bed.self || !bed.origin || !bedOriginFree(objects)) return false;
        const distance=bedDistance(bed.self,bed.origin);
        const known=bedKnowledgeFor(bedLayoutSignature());
        return distance>=BED_PLACE_MIN && distance<=BED_PLACE_MAX &&
            !bedForbiddenGoal(bed.self,known) &&
            bedSegmentFree(bed.self,bed.origin,objects,0);
    }
    // A player may respawn inside our *estimated* enlarged collisions, even
    // though the server considers their position valid. Allow the first steps
    // to escape if they strictly decrease penetration. Otherwise A* cannot
    // expand even a single neighbor.
    function bedOverlap(p,objects,clearance) {
        let total=0;
        for(const o of objects) {
            const d=bedDistance(p,o);
            total+=Math.max(0,o.radius+clearance+1-d);
        }
        return total;
    }
    function bedRouteSegment(from,to,objects,clearance) {
        if(bedSegmentFree(from,to,objects,clearance))return true;
        // Escape exception applies only near the last authoritative location.
        if(!bed.self || bedDistance(from,bed.self)>70 ||
            bedDistance(to,bed.self)>76)return false;
        const initial=bedOverlap(from,objects,clearance);
        if(initial<=0)return false;
        const samples=Math.max(2,Math.ceil(bedDistance(from,to)/5));
        let previous=initial;
        for(let i=1;i<=samples;i++){
            const t=i/samples;
            const pos={x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t};
            const value=bedOverlap(pos,objects,clearance);
            if(value>previous+0.8)return false;
            previous=value;
        }
        return previous<initial-0.5;
    }
    function saveBedKnowledge() {
        try {localStorage.setItem(BED_ROUTE_STORAGE,
            JSON.stringify(bedRouteKnowledge.slice(0,BED_ROUTE_MEMORY_MAX)));}
        catch (_) { /* Private browsing/storage quota: keep in-memory learning. */ }
    }
    function bedLayoutSignature(now=performance.now()) {
        if(!bed.origin || bed.socketEpoch!==session.connectionEpoch)return null;
        const objects=[];
        for(const obj of bed.nearby.values()) {
            if(!bedBlocksMovement(obj.type) || obj.type===SPAWN_BED_ENTITY_TYPE ||
                now-obj.at>BED_NEARBY_TTL)continue;
            if(bedDistance(obj,bed.origin)>190)continue;
            objects.push({type:obj.type,dx:Math.round((obj.x-bed.origin.x)/18),
                dy:Math.round((obj.y-bed.origin.y)/18),d:bedDistance(obj,bed.origin)});
        }
        if(objects.length<2)return null;
        return 'v5:'+objects.sort((a,b)=>a.d-b.d).slice(0,12)
            .map(o=>`${o.type},${o.dx},${o.dy}`).sort().join('|');
    }
    function decodeBedLayout(key) {
        if(!key?.startsWith('v5:'))return null;
        const arr=key.slice(3).split('|').map(s=>s.split(',').map(Number));
        return arr.length>=2 && arr.every(a=>a.length===3 && a.every(Number.isFinite))?arr:null;
    }
    // A few pixels of spawn-position or object jitter should not cause a new
    // memory slot. Reuse only near-identical obstacle layouts, not old servers.
    function bedMemoryMatchesSite(record) {
        return !!(record && bed.origin && session.ws &&
            bed.socketEpoch===session.connectionEpoch &&
            record.server===String(session.ws.url||'') &&
            record.anchor && bedDistance(record.anchor,bed.origin)<=42);
    }
    function matchingBedKnowledge(key) {
        const scene=decodeBedLayout(key);
        if(!scene)return null;
        let best=null,bestCost=Infinity;
        for(const record of bedRouteKnowledge) {
            if(!bedMemoryMatchesSite(record))continue;
            const saved=decodeBedLayout(record.key);
            if(!saved || saved.length!==scene.length)continue;
            const used=new Set();let matched=0,cost=0;
            for(const item of scene) {
                let which=-1,least=Infinity;
                for(let i=0;i<saved.length;i++) {
                    if(used.has(i) || saved[i][0]!==item[0])continue;
                    const d=Math.hypot(saved[i][1]-item[1],saved[i][2]-item[2]);
                    if(d<least){least=d;which=i;}
                }
                if(which>=0 && least<=1.5){used.add(which);matched++;cost+=least;}
            }
            if(matched===scene.length && cost<=Math.max(1.25,scene.length*0.50) &&
                cost<bestCost){bestCost=cost;best=record;}
        }
        return best;
    }
    function bedKnowledgeFor(key,create=false) {
        if(!key)return null;
        if(!bed.origin || bed.socketEpoch!==session.connectionEpoch || !session.ws)
            return null;
        let item=bedRouteKnowledge.find(r=>r.key===key && bedMemoryMatchesSite(r)) ||
            matchingBedKnowledge(key);
        if(!item && create) {
            item={key,server:String(session.ws.url||''),
                anchor:{x:bed.origin.x,y:bed.origin.y},
                good:null,goodGoal:null,bad:{},blocks:[],badGoals:[],ok:0,updated:0};
            bedRouteKnowledge.unshift(item);
            if(bedRouteKnowledge.length>BED_ROUTE_MEMORY_MAX)bedRouteKnowledge.pop();
        }
        return item;
    }
    function bedPromoteLayout(now=performance.now()) {
        const fresh=bedLayoutSignature(now);
        if(!fresh)return bed.layoutKey;
        if(!bed.layoutKey){bed.layoutKey=fresh;return fresh;}
        if(fresh===bed.layoutKey){
            bed.layoutCandidate=null;bed.layoutCandidateCount=0;
            return fresh;
        }
        // A new wall, destroyed wall or different spawn layout must not use
        // stale routes. Require a few consistent snapshots so one incomplete
        // server update cannot discard the memory from a valid arrangement.
        if(bed.layoutCandidate===fresh)bed.layoutCandidateCount++;
        else {bed.layoutCandidate=fresh;bed.layoutCandidateCount=1;}
        if(bed.layoutCandidateCount>=3){
            bed.layoutKey=fresh;bed.layoutCandidate=null;
            bed.layoutCandidateCount=0;bed.usedLearned=false;
        }
        return bed.layoutKey;
    }
    function bedSector(point) {
        if(!bed.origin)return null;
        const dx=point.x-bed.origin.x,dy=point.y-bed.origin.y;
        if(Math.hypot(dx,dy)<8)return null;
        return String(Math.round(((Math.atan2(dy,dx)+2*Math.PI)%(2*Math.PI))*32/(2*Math.PI))%32);
    }
    function bedFailureCost(point,entry) {
        const sector=bedSector(point);
        return sector===null ? 0 : Math.min(160,(entry?.bad?.[sector]||0)*28);
    }
    // Each failure records the real, server-observed stall POSITION and the
    // blocked movement direction, not only a global compass sector. Candidate
    // routes must avoid the same corridor instead of merely paying a penalty.
    function bedForbiddenSegment(from,to,entry) {
        if(!bed.origin)return false;
        const blocks=[...(entry?.blocks||[]),...bed.localBlocked];
        if(!blocks.length)return false;
        const len=bedDistance(from,to);
        if(len<0.1)return false;
        const ux=(to.x-from.x)/len,uy=(to.y-from.y)/len;
        for(const b of blocks) {
            // Treat a failed path as a blocked *directional corridor*, not an
            // impassable circle. Opposite-direction escape remains available.
            if(ux*b.dx+uy*b.dy<0.60)continue;
            const px=bed.origin.x+b.x,py=bed.origin.y+b.y;
            const along=(px-from.x)*ux+(py-from.y)*uy;
            if(along< -7 || along>len+9)continue;
            const lateral=Math.abs((px-from.x)*uy-(py-from.y)*ux);
            if(lateral<=19)return true;
        }
        return false;
    }
    function bedForbiddenGoal(point,entry) {
        if(!entry?.badGoals?.length || !bed.origin)return false;
        const x=point.x-bed.origin.x,y=point.y-bed.origin.y;
        return entry.badGoals.some(p=>Math.hypot(x-p.x,y-p.y)<=17);
    }
    function rememberBedFailure(point,to=bed.moveTo) {
        if(!point || !to || !bed.pending || !bed.origin ||
            bed.socketEpoch!==session.connectionEpoch)return;
        const distance=bedDistance(point,to);
        if(distance<10)return;
        const key=bedLayoutSignature() || bed.layoutKey;
        const entry=key ? bedKnowledgeFor(key,true) : null;
        const dx=(to.x-point.x)/distance,dy=(to.y-point.y)/distance;
        const probe={x:Math.round((point.x+dx*15-bed.origin.x)/6)*6,
            y:Math.round((point.y+dy*15-bed.origin.y)/6)*6,dx,dy};
        // Even during partial snapshots, never retry a corridor that was
        // physically blocked earlier in THIS run. Persist it once the wall
        // layout has a reliable signature.
        const local=bed.localBlocked.find(b=>
            Math.hypot(b.x-probe.x,b.y-probe.y)<19 && b.dx*dx+b.dy*dy>0.7);
        if(local){local.n=Math.min(9,(local.n||1)+1);}
        else {bed.localBlocked.push({...probe,n:1});
            if(bed.localBlocked.length>48)bed.localBlocked.shift();}
        if(!entry){bed.failedThisRun++;bed.lastFailureAt=performance.now();return;}
        let found=entry.blocks.find(b=>
            Math.hypot(b.x-probe.x,b.y-probe.y)<19 && b.dx*dx+b.dy*dy>0.7);
        if(found){found.n=Math.min(9,(found.n||1)+1);found.at=Date.now();}
        else {entry.blocks.push({...probe,n:1,at:Date.now()});
            if(entry.blocks.length>42)entry.blocks.shift();}
        const sector=bedSector(to);
        if(sector!==null)entry.bad[sector]=Math.min(6,(Number(entry.bad[sector])||0)+1);
        bed.failedThisRun++;bed.lastFailureAt=performance.now();
        // Keep verified positions from server snapshots. A stalled movement
        // creates no new position; the eventual successful detour is learnable.
        if (!bed.trace.length || bedDistance(bed.trace.at(-1),point)>=8)
            bed.trace.push({x:point.x,y:point.y});
        bed.blocked.push({x:point.x+dx*15,y:point.y+dy*15,at:performance.now()});
        if(bed.blocked.length>8)bed.blocked.shift();
        if(bed.usedLearned) {
            entry.good=null;bed.usedLearned=false;
        }
        bed.layoutKey=entry.key;entry.updated=Date.now();saveBedKnowledge();
    }
    function rememberBedPlacementFailure(point) {
        const key=bedLayoutSignature() || bed.layoutKey;
        if(!key || !point || !bed.origin)return;
        const entry=bedKnowledgeFor(key,true);
        const x=Math.round(point.x-bed.origin.x),y=Math.round(point.y-bed.origin.y);
        if(!bedForbiddenGoal(point,entry)) {
            entry.badGoals.push({x,y,at:Date.now()});
            if(entry.badGoals.length>24)entry.badGoals.shift();
        }
        bed.failedThisRun++;entry.updated=Date.now();saveBedKnowledge();
    }
    function rememberBedMovement(point) {
        if(!bed.origin || !bed.locked ||
            bed.socketEpoch!==session.connectionEpoch)return;
        if(!bed.layoutKey)bed.layoutKey=bedLayoutSignature(point.at);
        const last=bed.trace[bed.trace.length-1]||bed.origin;
        if(bedDistance(last,point)>=9) {
            bed.trace.push({x:point.x,y:point.y});
            if(bed.trace.length>96)bed.trace.shift();
        }
    }
    function rememberBedSuccess(observedBed=null,now=performance.now()) {
        if(!bed.origin || !bed.self || bed.socketEpoch!==session.connectionEpoch ||
            !bed.lastAt || now-bed.lastAt>3000)return false;
        if(observedBed && bedDistance(observedBed,bed.origin)>BED_POSITION_TOLERANCE)
            return false;
        const key=bedLayoutSignature(now) || bed.layoutKey;
        if(!key)return false;
        const entry=bedKnowledgeFor(key,true);
        const finish={x:Math.round(bed.self.x-bed.origin.x),
            y:Math.round(bed.self.y-bed.origin.y)};
        if(bedDistance(bed.self,bed.origin)>=BED_PLACE_MIN &&
            bedDistance(bed.self,bed.origin)<=BED_PLACE_MAX &&
            (!observedBed || bedDistance(observedBed,bed.origin)<=12)) {
            entry.goodGoal=finish;
            if(bed.trace.length) {
                const objects=bedObstacles(now),points=[bed.origin,...bed.trace,bed.self];
                const route=[];let from=bed.origin,index=1;
                // Simplify by LOS without cutting across corners. An invalid
                // remembered shortcut was another cause of repeated failures.
                while(index<points.length && route.length<16){
                    let far=index;
                    for(let j=Math.min(points.length-1,index+18);j>=index;j--) {
                        if(bedRouteSegment(from,points[j],objects,10) &&
                            !bedForbiddenSegment(from,points[j],entry)) {far=j;break;}
                    }
                    route.push({x:Math.round(points[far].x-bed.origin.x),
                        y:Math.round(points[far].y-bed.origin.y)});
                    from=points[far];index=far+1;
                }
                if(index>=points.length && route.length && route.length<=16)
                    entry.good=route;
            }
        }
        // An offset bed is a server-confirmed placement, but NOT a route that
        // reliably hits the original spawn center; do not teach it as perfect.
        const precise=!observedBed || bedDistance(observedBed,bed.origin)<=12;
        if(precise)entry.ok=(entry.ok||0)+1;
        entry.updated=Date.now();bed.lastLearned=precise;
        saveBedKnowledge();return precise;
    }
    function replayBedRoute(now,clearance=BED_NAV_BODY) {
        const key=bedLayoutSignature(now);
        const entry=bedKnowledgeFor(key);
        if(!entry?.good?.length)return null;
        const obstacles=bedObstacles(now);
        const route=entry.good.map(p=>({x:bed.origin.x+p.x,y:bed.origin.y+p.y}));
        const last=route.at(-1);
        if(bedDistance(last,bed.origin)<BED_PLACE_MIN ||
            bedDistance(last,bed.origin)>BED_PLACE_MAX ||
            bedForbiddenGoal(last,entry) ||
            !bedSegmentFree(last,bed.origin,obstacles,0))return null;
        const allowed=Math.min(clearance,16);
        let from=bed.self;
        for(const point of route) {
            if(!bedRouteSegment(from,point,obstacles,allowed) ||
                bedForbiddenSegment(from,point,entry))return null;
            from=point;
        }
        bed.layoutKey=entry.key;bed.usedLearned=true;
        return route;
    }
    function planBedRoute(now=performance.now(),clearance=BED_NAV_BODY) {
        if(!bed.origin || !bed.self) return null;
        const obstacles=bedObstacles(now);
        if(!bedOriginFree(obstacles)) return null;
        bedPromoteLayout(now);
        const known=bedKnowledgeFor(bed.layoutKey||bedLayoutSignature(now));
        // Fast path: most respawns need only one step through a diagonal gap.
        // Check 32 radials before allocating a grid and running A*.
        // Target the actual 76-unit build radius to preserve exact positioning.
        const source=bed.self;
        const preferred=Math.atan2(source.y-bed.origin.y,source.x-bed.origin.x);
        let direct=null,score=Infinity;
        for(let i=0;i<32;i++) {
            const delta=(i%2 ? -1:1)*Math.ceil(i/2)*Math.PI/16;
            const angle=preferred+delta;
            const target={x:bed.origin.x+BED_BUILD_DISTANCE*Math.cos(angle),
                y:bed.origin.y+BED_BUILD_DISTANCE*Math.sin(angle)};
            if(!bedPointFree(target.x,target.y,obstacles,clearance) ||
                !bedSegmentFree(source,target,obstacles,clearance) ||
                !bedSegmentFree(target,bed.origin,obstacles,0) ||
                bedForbiddenSegment(source,target,known) ||
                bedForbiddenGoal(target,known)) continue;
            const distance=bedDistance(source,target);
            const preferredGoal=known?.goodGoal ?
                Math.hypot(target.x-bed.origin.x-known.goodGoal.x,
                    target.y-bed.origin.y-known.goodGoal.y):0;
            const weighted=distance+bedFailureCost(target,known)+preferredGoal*0.45;
            if(weighted<score){score=weighted;direct=target;}
        }
        if(direct && score>=BED_NAV_WAYPOINT) return [direct];
        // Grid covers a 480x480 area around spawn. A* examines walkable
        // cells rather than the four cardinal directions used before.
        const half=Math.ceil(BED_NAV_RADIUS/BED_NAV_GRID),side=half*2+1;
        const size=side*side,center=bed.origin;
        const sx=Math.round((bed.self.x-center.x)/BED_NAV_GRID);
        const sy=Math.round((bed.self.y-center.y)/BED_NAV_GRID);
        if(Math.abs(sx)>half || Math.abs(sy)>half) return null;
        const encode=(x,y)=>(y+half)*side+(x+half);
        const coords=id=>({x:center.x+(id%side-half)*BED_NAV_GRID,
            y:center.y+(Math.floor(id/side)-half)*BED_NAV_GRID});
        const pass=new Uint8Array(size),done=new Uint8Array(size);
        const costs=new Float64Array(size),parent=new Int32Array(size);
        costs.fill(Infinity);parent.fill(-1);
        const start=encode(sx,sy),moves=[[-1,0],[1,0],[0,-1],[0,1],
            [-1,-1],[-1,1],[1,-1],[1,1]];
        const free=id=>{
            if(id===start) return true; // Server confirms our actual position.
            if(!pass[id]) {
                const p=coords(id);
                const overlap=bedOverlap(p,obstacles,clearance);
                const nearStart=bedDistance(p,bed.self)<=70;
                const startOverlap=bedOverlap(bed.self,obstacles,clearance);
                pass[id]=(overlap===0 ||
                    (nearStart && startOverlap>0 && overlap<startOverlap-0.5))?2:1;
            }
            return pass[id]===2;
        };
        const heuristic=id=>Math.max(0,Math.abs(bedDistance(coords(id),center)-76)-9)+
            (known?.goodGoal ? bedDistance(coords(id),{
                x:center.x+known.goodGoal.x,y:center.y+known.goodGoal.y})*0.18:0);
        const heap=[];
        const push=(id,score)=>{
            let k=heap.length;heap.push({id,score});
            while(k){const p=(k-1)>>1;if(heap[p].score<=score)break;
                heap[k]=heap[p];k=p;}
            heap[k]={id,score};
        };
        const pop=()=>{
            const top=heap[0],last=heap.pop();
            if(heap.length) {
                let k=0;
                while(2*k+1<heap.length) {
                    let child=2*k+1;
                    if(child+1<heap.length && heap[child+1].score<heap[child].score)child++;
                    if(last.score<=heap[child].score)break;
                    heap[k]=heap[child];k=child;
                }
                heap[k]=last;
            }
            return top.id;
        };
        costs[start]=0;push(start,heuristic(start));
        let goal=-1,iterations=0;
        while(heap.length && iterations++<size) {
            const node=pop();
            if(done[node]) continue;
            done[node]=1;
            const at=node===start?bed.self:coords(node),r=bedDistance(at,center);
            if(node!==start && r>=BED_PLACE_MIN && r<=BED_PLACE_MAX &&
                !bedForbiddenGoal(at,known) &&
                bedSegmentFree(at,center,obstacles,4)) {goal=node;break;}
            const x=node%side,y=Math.floor(node/side);
            for(const [dx,dy] of moves) {
                const nx=x+dx,ny=y+dy;
                if(nx<0 || ny<0 || nx>=side || ny>=side) continue;
                const next=ny*side+nx;
                if(done[next] || !free(next)) continue;
                // Do not corner-cut between genuinely blocked cells.
                // The start position itself is verified by the server, so
                // allow the first step out of inflated estimate boundaries.
                if(dx && dy && node!==start &&
                    (!free(y*side+nx) || !free(ny*side+x)))continue;
                const target=coords(next);
                if(!bedRouteSegment(at,target,obstacles,clearance) ||
                    bedForbiddenSegment(at,target,known))continue;
                const cost=costs[node]+Math.hypot(dx,dy)*BED_NAV_GRID+
                    Math.min(40,bedOverlap(target,obstacles,clearance)*0.9)+
                    (node===start ? bedFailureCost(target,known) : 0);
                if(cost>=costs[next])continue;
                costs[next]=cost;parent[next]=node;
                push(next,cost+heuristic(next));
            }
        }
        if(goal<0)return null;
        const reversed=[];
        for(let node=goal;node!==start && node>=0;node=parent[node])
            reversed.push(coords(node));
        reversed.reverse();
        // Smooth the A* route using collision-tested line of sight, keeping
        // turns at the passage instead of taking a direct line through walls.
        const smooth=[];let from=bed.self,index=0;
        while(index<reversed.length) {
            let far=index;
            for(let j=reversed.length-1;j>=index;j--)
                if(bedRouteSegment(from,reversed[j],obstacles,clearance) &&
                    !bedForbiddenSegment(from,reversed[j],known)) {far=j;break;}
            const waypoint=reversed[far];
            smooth.push(waypoint);from=waypoint;index=far+1;
        }
        return smooth;
    }
    function bedCanWork(now=performance.now()) {
        // Server snapshots are the control clock even in background tabs.
        return bed.pending && settings.autoSpawnBed && bed.unlocked &&
            player.alive && connected() && bed.spawnAnchorConfirmed &&
            !!bed.origin && !!bed.self &&
            now-bed.self.at<=BED_SNAPSHOT_TTL &&
            // Movement and healing use separate channels. Low HP alone must
            // never block bed navigation, even with Auto Heal disabled.
            !macro.selected &&
            !Object.keys(macroDefs).some(macroActive) && !ap.manualItem &&
            // The HUD can stay open for diagnostics. It must never cancel a task.
            session.ws.bufferedAmount<2048;
    }
    function driveBedWaypoint(now,point) {
        if(!point || !bedCanWork(now) || bed.moveTries>=BED_NAV_MAX_LEGS ||
            !claimBedInput(now)) return false;
        const angle=Math.atan2(point.y-bed.self.y,point.x-bed.self.x);
        bed.phase='moving';bed.startedAt=now;
        bed.moveFrom={x:bed.self.x,y:bed.self.y};bed.moveTo=point;
        // Never stop a long leg after a short fixed 360 ms. Keep processing
        // snapshots while it moves and stop immediately on reaching the goal.
        const remaining=bedDistance(bed.self,point);
        bed.moveLimitMs=Math.min(BED_MAX_MOVE_MS,Math.max(200,remaining/0.17+130));
        if(!transmit([1,...apAngleBytes(angle)])) {
            bed.phase='await-position';bed.nextAt=now+25;return false;
        }
        bed.moveOwned=true;bed.moveTries++;
        bed.moveFeedbackAt=now;
        bed.moveLastPos={x:bed.self.x,y:bed.self.y};
        clearBedStop();armBedStop(now);
        return true;
    }
    function trySpawnBed(now=performance.now()) {
        if(ageRecovery.pending)return; // Recovery must happen before bed movement.
        if(!bed.pending || !settings.autoSpawnBed || !player.alive || !connected() ||
            bed.socketEpoch!==session.connectionEpoch)return;
        // Lock the manual controls as soon as valid navigation begins. This
        // prevents a player's input from repeatedly cancelling the pathfinder.
        if(bed.locked && now-bed.lockSince>=BED_MAX_TASK_MS) {
            retrySpawnBed('Tempo limite de navegação',now);return;
        }
        if(bed.locked && (!bed.self || now-bed.self.at>BED_SNAPSHOT_TTL)){
            retrySpawnBed('Aguardando posição atualizada',now);return;
        }
        if(bed.phase==='retry'){
            if(bed.handoffMove || bed.moveKeys.size || now-bed.lastManualMoveAt<350 ||
                !bedCanWork(now) || bed.self.at<=bed.awaitFreshAt)return;
            const layout=bedLayoutSignature(now);
            const changed=layout!==null && bed.retryLayout!==null && layout!==bed.retryLayout;
            if(now<bed.nextAt && !changed)return;
            if(changed){bed.localBlocked=[];bed.blocked=[];bed.retryCount=0;}
            bed.phase='await-position';bed.nextAt=now;bed.retryReason='';
            bed.awaitFreshAt=0;
        }
        // The player has regained movement. Keep the server-confirmation
        // window open briefly to learn the bed, but never steal WASD again.
        if (bed.manualAfterPlacement) {
            if (now-bed.lastAt>=1000) abortSpawnBed('Player resumed movement');
            return;
        }
        if(bed.phase==='await-heal' && bed.handoffMove)return;
        if(bed.phase==='moving') {
            if(macro.selected ||
                ap.manualItem || session.ws.bufferedAmount>=2048) {
                stopBedMovement();bed.phase='await-position';
                bed.route=[];bed.awaitFreshAt=now;bed.nextAt=now+25;return;
            }
            if(!bed.moveOwned || !bed.self || !bed.moveTo)return;
            const objects=bedObstacles(now);
            if(bedReadyToPlace(objects)) {
                stopBedMovement();bed.phase='placing';bed.nextAt=now;
                bed.awaitFreshAt=0;
            } else {
                const at=bed.self;
                // Do not wait for the full timeout when fresh server snapshots
                // show that the player has stopped moving against an obstacle.
                if(at.at>bed.moveFeedbackAt+35) {
                    if(bed.moveLastPos && bedDistance(at,bed.moveLastPos)>=3) {
                        bed.moveLastPos={x:at.x,y:at.y};
                        bed.moveFeedbackAt=now;
                    } else if(now-bed.moveFeedbackAt>=145) {
                        onBedMovementTimeout(true);return;
                    }
                }
                if(now-bed.startedAt>=bed.moveLimitMs) {
                    onBedMovementTimeout();return;
                }
                if(bedDistance(at,bed.moveTo)<=BED_NAV_WAYPOINT &&
                    at.at>bed.startedAt) {
                    bed.waypoint++;
                    if(bed.waypoint<bed.route.length) {
                        if(!driveBedWaypoint(now,bed.route[bed.waypoint]))
                            retrySpawnBed('Recalculando trecho interrompido',now);
                        return;
                    }
                    stopBedMovement();bed.phase='await-position';
                    bed.route=[];bed.nextAt=now+1;bed.awaitFreshAt=now;return;
                }
                // Structures can appear or disappear while walking: replan.
                if(!bedRouteSegment(at,bed.moveTo,objects,bed.clearance) &&
                    at.at>bed.startedAt+80) {
                    stopBedMovement();bed.phase='await-position';
                    bed.route=[];bed.nextAt=now+5;bed.awaitFreshAt=now;return;
                }
                return;
            }
        }
        if(now<bed.nextAt || !bedCanWork(now) ||
            (bed.awaitFreshAt && bed.self.at<=bed.awaitFreshAt))return;
        const objects=bedObstacles(now);
        if(!bedOriginFree(objects)) {
            retrySpawnBed('Centro da cama bloqueado',now);
            return;
        }
        if(!bedReadyToPlace(objects)) {
            if(bed.moveTries>=BED_NAV_MAX_LEGS) {
                retrySpawnBed('Ponto de colocação ainda inacessível',now);return;
            }
            bedPromoteLayout(now);
            let route=null;
            bed.usedLearned=false;
            for(const clearance of [BED_NAV_BODY,22,16,10]) {
                // Successful paths get first chance, but every replay must
                // pass current obstacle checks. Never force an outdated path.
                route=replayBedRoute(now,clearance)||planBedRoute(now,clearance);
                if(route?.length){bed.clearance=clearance;break;}
            }
            if(!route || !route.length) {
                retrySpawnBed('Nenhuma rota livre no momento',now);
                return;
            }
            bed.noRoute=0;bed.route=route;bed.routeAt=now;bed.waypoint=0;
            driveBedWaypoint(now,route[0]);return;
        }
        // Only the actual building selection conflicts with food. Keep the
        // task pending, release movement controls and their safety timer, and
        // do not count a food hold as a failed placement or navigation leg.
        if(heal.phase!=='idle' || heal.foodSelected){
            stopBedMovement();
            bed.phase='await-heal';
            if(bed.locked)releaseBedInput(true);
            return;
        }
        if(bed.phase==='await-heal'){
            // Replan from the fresh position above if knockback moved us.
            // A real manual movement handoff must not be stolen mid-keyhold.
            if(bed.handoffMove)return;
            bed.phase='placing';
        }
        if(bed.tries>=4) {
            // Wait for a fresh snapshot; no server response is not proof of
            // an invalid goal. Do not poison route memory during lag spikes.
            if(!bed.self || bed.self.at<=bed.lastAt) {
                if(now-bed.lastAt<850){bed.nextAt=now+85;return;}
                retrySpawnBed('Aguardando confirmação do servidor',now);return;
            }
            // Move to ANOTHER placement angle in the SAME respawn, instead of
            // retrying one impossible position on every future life.
            rememberBedPlacementFailure(bed.self);
            bed.placementFailures++;
            if(bed.placementFailures>=3) {
                retrySpawnBed('Posições rejeitadas; recalculando',now);return;
            }
            stopBedMovement();bed.tries=0;bed.phase='await-position';
            bed.route=[];bed.waypoint=0;bed.nextAt=now+12;
            bed.awaitFreshAt=bed.self.at;
            return;
        }
        if(!claimBedInput(now)) return;
        // Explicit neutral movement before each placement attempt. The
        // previous route STOP may not have been sent if no owned leg remained.
        stopBedMovement(true,true);
        if(bed.tries===0 && bed.lastAt===0) {
            for (const [id,obj] of bed.nearby)
                if(obj.type===SPAWN_BED_ENTITY_TYPE)bed.knownBedIds.add(id);
        }
        const angle=Math.atan2(bed.origin.y-bed.self.y,bed.origin.x-bed.self.x);
        const aim=apAngleBytes(angle);
        bed.phase='placing';session.lastAutomationAt=now;
        if(session.attacking)transmit([18]);
        if(!transmit([0,SPAWN_BED_TYPE])) {
            // Never hold the user's keyboard after a failed send.
            releaseBedInput(true);bed.nextAt=now+130;return;
        }
        const placed=transmit([19,...aim]);
        transmit([18]);restoreWeapon();
        if(placed){bed.tries++;bed.lastAt=now;bed.nextAt=now+Math.max(115,ap.tick*2);}
        // An accepted WebSocket send isn't proof of placement; continue
        // observing the server separately. But movement must unlock NOW,
        // rather than waiting 1-2 seconds for the bed entity to appear.
        releaseBedInput(true);
    }

    function connected() { return session.ws && session.ws.readyState === 1; }
    function transmit(bytes) {
        if (!connected()) return false;
        try { originalSend.call(session.ws, new Uint8Array(bytes)); return true; }
        catch (_) { return false; }
    }
    function currentAim() {
        // The native client owns the aim, including its X lock. Mouse coordinates
        // are not authoritative: the pointer can move while the game aim is locked.
        return session.nativeAim || session.serverAim;
    }
    function resetCombatState() {
        resetSpin();
        session.nativeAim = null;
        session.serverAim = null;
        session.self = null;
        session.weapon = 0;
        session.weaponPacket = [0,0];
        session.weaponIds = [null,null];
        session.lastNativeWeaponAt = -Infinity;
        session.lastAutomationAt = -Infinity;
        session.attacking = false;
    }
    function rememberSlot(slot) {
        session.weapon = slot;
        session.weaponPacket = [0,slot];
        session.lastNativeWeaponAt = performance.now();
    }
    function rememberDirectWeapon(id) {
        // Opcode 2 selects an actual item ID, unlike opcode 0 (slot).
        // Hammer ID 15 is documented in Astral; other IDs must have been
        // observed in a weapon slot, rather than assuming all item IDs are weapons.
        const slot = id === 15 ? 1 : session.weaponIds.indexOf(id);
        if (slot < 0) return false;
        session.weapon = slot;
        session.weaponPacket = [2,id];
        session.lastNativeWeaponAt = performance.now();
        return true;
    }
    function observeWeapon(id) {
        const now = performance.now();
        // Never learn the temporarily selected food/building or a delayed
        // pre-selection snapshot as a new manual weapon choice.
        if (heal.phase !== 'idle' || macro.selected || now-session.lastAutomationAt < 250 ||
            now-session.lastNativeWeaponAt < 250) return;
        if (id === 15) {
            session.weapon = 1;
            session.weaponPacket = [2,15];
            session.weaponIds[1] = 15;
        } else if (session.weaponPacket[0] === 0 &&
                   [0,1,3,4,13,17,28,30,31].includes(id)) {
            session.weaponIds[session.weapon] = id;
        }
    }
    function restoreWeapon() {
        if (!connected() || !transmit(session.weaponPacket)) return false;
        // Restore direction/attack only if a real, manual attack was in progress.
        const aim = settings.returnSpin && spin.aim ? spin.aim : currentAim();
        if (aim) transmit(session.attacking ? [19, ...aim] : [13, ...aim]);
        return true;
    }
    // Background tabs throttle window timers, and may throttle workers as well.
    // The socket's incoming snapshots drive heal directly; this optional worker
    // provides an additional wake source while the tab is hidden. Neither path
    // can override browser suspension or a server-side heal cooldown.
    const healClock = { worker: null, unavailable: false };
    function makeHealWorker() {
        if (healClock.worker || healClock.unavailable) return healClock.worker;
        if (typeof Worker !== 'function' || typeof Blob !== 'function' ||
            typeof URL.createObjectURL !== 'function') {
            healClock.unavailable = true;
            return null;
        }
        let url = null;
        try {
            const code = `let timer=null;
                onmessage=event=>{
                    if(timer!==null){clearTimeout(timer);timer=null;}
                    if(event.data && event.data.type==='wake'){
                        const revision=event.data.revision;
                        timer=setTimeout(()=>{timer=null;postMessage(revision);},
                            Math.max(1,Math.ceil(event.data.delay)));
                    }
                };`;
            url = URL.createObjectURL(new Blob([code], {type:'text/javascript'}));
            const worker = new Worker(url);
            healClock.worker = worker;
            worker.onmessage = event => {
                if (event.data !== heal.revision) return;
                clearWake();
                evaluate();
            };
            worker.onerror = () => {
                healClock.unavailable = true;
                worker.terminate();
                if (healClock.worker === worker) healClock.worker = null;
                // The window timer and inbound packets remain active.
            };
            return worker;
        } catch (_) {
            healClock.unavailable = true;
            return null;
        } finally {
            if (url) URL.revokeObjectURL(url);
        }
    }
    function clearWake() {
        ++heal.revision;
        if (heal.timer !== null) clearTimeout(heal.timer);
        heal.timer = null;
        heal.timerAt = Infinity;
        if (healClock.worker) {
            try { healClock.worker.postMessage({type:'cancel'}); } catch (_) {}
        }
    }
    function wakeAt(time) {
        if (!Number.isFinite(time)) return;
        // Keep existing wake-up when updates arrive repeatedly: otherwise we
        // continually postpone the clock in active (and background) tabs.
        if (heal.timer !== null && Math.abs(heal.timerAt - time) < 2) return;
        clearWake();
        const version = heal.revision;
        heal.timerAt = time;
        const delay = Math.max(1, Math.ceil(time - performance.now()));
        heal.timer = setTimeout(() => {
            if (version !== heal.revision) return;
            clearWake();
            evaluate();
        }, delay);
        const worker = makeHealWorker();
        if (worker) {
            try { worker.postMessage({type:'wake', revision:version, delay}); }
            catch (_) { healClock.unavailable = true; worker.terminate(); healClock.worker = null; }
        }
    }
    function resetHealTelemetry() {
        heal.snapshotAt = 0;
        heal.lastSentAt = -Infinity;
        heal.sentSnapshotAt = -Infinity;
        heal.snapshotSerial = 0;
        heal.sentSnapshotSerial = -1;
        heal.sentInSnapshot = 0;
        heal.sentTimes.length=0;
        heal.lastDamageAt = -Infinity;
        heal.holdDeadline=0;heal.restore=null;heal.observedItem=null;heal.observedItemAt=0;
    }
    function cancelHeal(restore = true) {
        clearWake();
        if (restore && heal.foodSelected) requestHealRestore();
        if(!restore)heal.restore=null;
        heal.phase = 'idle';
        heal.foodSelected = false;
        heal.until = 0;
        heal.holdDeadline=0;
        heal.nextAt = 0;
    }
    // A completed send is not evidence that food was deselected on the server.
    // Watch only food selected by our heal; native item changes revoke ownership.
    const HEAL_FOOD_IDS=new Set([10,12]);
    function requestHealRestore(now=performance.now()){
        if(!player.alive || !connected())return false;
        transmit([18]);
        const sent=restoreWeapon();
        heal.restore={epoch:session.connectionEpoch,at:now,nextAt:now+160,
            expires:now+1800,tries:0,sent};
        return sent;
    }
    function watchHealRestore(now=performance.now()){
        const r=heal.restore;
        if(!r)return false;
        if(!player.alive || !connected() || r.epoch!==session.connectionEpoch || now>r.expires){
            heal.restore=null;return false;
        }
        if(heal.phase!=='idle' || heal.foodSelected || ageRecovery.pending ||
            macro.selected || Object.keys(macroDefs).some(macroActive) ||
            (bed.pending && bed.phase==='placing' && bed.locked))return false;
        const fresh=heal.observedItemAt>r.at && now-heal.observedItemAt<=750;
        if(fresh && !HEAL_FOOD_IDS.has(heal.observedItem)){
            heal.restore=null;return false;
        }
        if(now<r.nextAt || (r.sent && !fresh))return false;
        if(r.tries>=3){heal.restore=null;return false;}
        if(session.ws.bufferedAmount>=2048)return true;
        transmit([18]);
        r.sent=restoreWeapon();
        r.tries++;r.nextAt=now+160;
        return true;
    }
    function recoverStuckHeal(now=performance.now()){
        if(heal.phase!=='holding')return false;
        if(heal.foodSelected && now<=heal.holdDeadline &&
            heal.snapshotAt && now-heal.snapshotAt<=1300)return false;
        // No more consumption attempts after the hold deadline or stale data.
        // Mark the current snapshot used so it cannot immediately reselect food.
        cancelHeal(true);
        heal.sentSnapshotSerial=heal.snapshotSerial;
        heal.nextAt=now+25;
        return true;
    }
    function isEligible() {
        return !ageRecovery.pending && settings.autoHeal && player.alive && player.id >= 0 &&
            player.health > 0 && player.health < 100 && connected();
    }
    const LEGIT_HEAL_INTERVAL_MS=1;
    function smartHealInterval() {
        // Heal ms only controls NORMAL heal. Legit uses fixed 1-ms scheduling
        // while Hold Min/Max still determine randomized food hold duration.
        if(settings.legitHeal)return LEGIT_HEAL_INTERVAL_MS;
        if(guardCritical())return Math.min(settings.intervalMs,12);
        if(emergencyGuard())return Math.min(settings.intervalMs,24);
        return settings.intervalMs;
    }
    function canRetrySnapshot(now) {
        // One bounded normal-heal retry if HP is dangerous and the last
        // snapshot is recent. Avoid a food flood when the server is stalled.
        return !settings.legitHeal && player.health<=60 &&
            heal.sentInSnapshot<2 && now-heal.snapshotAt<=160 &&
            now-heal.lastSentAt>=Math.max(25,smartHealInterval()) &&
            session.ws && session.ws.bufferedAmount<1024 &&
            (!settings.lagGuard || networkState(now)!=='QUEUE');
    }
    function noteHealthSnapshot(health, now = performance.now()) {
        const previous = player.health;
        player.health = health;
        heal.snapshotAt = now;
        heal.snapshotSerial++;
        heal.sentInSnapshot=0;
        if (health + 0.5 < previous) {
            heal.lastDamageAt = now;
            // Normal heal reacts promptly to fresh damage, but doesn't send
            // another food packet earlier than a modest minimum after the last.
            // A new damage snapshot can advance the next heal, especially
            // after a katana hit; never reuse a pre-send snapshot to spam food.
            if (heal.phase === 'idle' && emergencyGuard(now)) {
                heal.nextAt = Math.min(heal.nextAt, Math.max(now,
                    heal.lastSentAt + (guardCritical(now) ? 12 : 24)));
            }
        }
    }
    function finishFood() {
        if (!isEligible()) { cancelHeal(); return false; }
        const now = performance.now();
        if (!currentAim() || !connected()) return false;
        // Do not eat blindly if the tab was frozen before the hold finished.
        if (!heal.snapshotAt || now - heal.snapshotAt > 1300) {
            cancelHeal();
            return false;
        }
        session.lastAutomationAt = now;
        if (!transmit([19, ...currentAim()])) return false;
        requestHealRestore(now);
        heal.foodSelected = false;
        heal.phase = 'idle';
        heal.until = 0;
        heal.holdDeadline=0;
        heal.lastSentAt = now;
        heal.sentSnapshotAt = heal.snapshotAt;
        heal.sentSnapshotSerial = heal.snapshotSerial;
        heal.sentInSnapshot++;
        heal.sentTimes.push(now);
        if (heal.sentTimes.length>80) heal.sentTimes.splice(0,heal.sentTimes.length-80);
        heal.nextAt = now + smartHealInterval();
        wakeAt(heal.nextAt);
        // Legit Heal may immediately start another hold on the next snapshot.
        // Use this idle gap; do not postpone a bed forever under repeated hits.
        // If the current snapshot has not yet reached observeSpawnBed, the
        // normal onGameMessage tail will use that newer position instead.
        if(bed.pending && bed.self && session.self && bed.self.at>=session.self.at)
            trySpawnBed(now);
        return true;
    }
    function randomHold() {
        const low = Math.min(settings.holdMinMs, settings.holdMaxMs);
        const high = Math.max(settings.holdMinMs, settings.holdMaxMs);
        return low + Math.floor(Math.random() * (high - low + 1));
    }
    function evaluate() {
        const now=performance.now();
        if(recoverStuckHeal(now))return;
        if(watchHealRestore(now))return;
        if (!isEligible()) {
            if (heal.phase !== 'idle' || heal.timer !== null) cancelHeal();
            return;
        }
        if (heal.phase === 'holding') {
            // A newly reported lethal-risk hit interrupts the cosmetic Legit
            // hold; one item is consumed immediately, not an unbounded burst.
            if (guardCritical(now)) heal.until=now;
            if (now < heal.until) { wakeAt(heal.until); return; }
            if (!finishFood() && heal.phase === 'holding') wakeAt(now + 25);
            return;
        }
        // When hidden, incoming socket snapshots still call evaluate(). The
        // clock is only a supplement, not permission to use stale health.
        if (!heal.snapshotAt || now - heal.snapshotAt > 750) {
            clearWake();
            return;
        }
        if (now < heal.nextAt) { wakeAt(heal.nextAt); return; }
        // A fresh post-send snapshot permits another normal/legit heal.
        // For normal heal only, one cautious retry can use the same recent
        // low-HP snapshot. This gives Heal ms an effect even when updates are
        // slower than the requested interval, without unlimited stale spam.
        if (heal.snapshotSerial <= heal.sentSnapshotSerial) {
            const eligibleRetry = canRetrySnapshot(now);
            if (!eligibleRetry) {
                if (!settings.legitHeal && player.health<=60 &&
                    heal.sentInSnapshot<2 && now-heal.snapshotAt<=135 &&
                    session.ws.bufferedAmount<1024) {
                    wakeAt(Math.max(now+1,heal.lastSentAt+Math.max(25,smartHealInterval())));
                } else clearWake();
                return;
            }
        }
        if (!currentAim()) return;
        releaseMacroSelection(); // Heal has priority over a held building.
        session.lastAutomationAt = now;
        if (session.attacking) transmit([18]);
        if (!transmit([0, 2])) { requestHealRestore(now); wakeAt(now + 50); return; }
        heal.restore=null;
        heal.foodSelected = true;
        heal.phase = 'holding';
        heal.until = now + (settings.legitHeal && !emergencyGuard(now) ? randomHold() : 0);
        heal.holdDeadline=heal.until+300;
        // Normal fast heal remains synchronous. During critical danger the
        // 3-Hit Guard also bypasses the randomized Legit hold to save time.
        if (!settings.legitHeal || emergencyGuard(now)) {
            if(!finishFood() && heal.phase==='holding')wakeAt(now+25);
        }else wakeAt(heal.until);
    }
    // Both held keys share a single scheduler. The requested interval is not
    // a promise of server throughput. This local budget is precautionary,
    // not a measured or documented server limit.
    const MACRO_PACKET_RATE = 240;
    const MACRO_BURST = 10;
    // Normal placement skips redundant weapon preselection and only stops
    // an existing native attack before selecting the building.
    // Reserve three packets for eventual restoration only on initial selection.
    function macroPacketCost() { return settings.legitMacro ? (macro.selected ? 3 : 6) : (session.attacking ? 6 : 5); }
    const macro = { held: {KeyV:false, KeyF:false}, next: {KeyV:0,KeyF:0},
        timer:null, turn:0, tokens:MACRO_BURST, last:performance.now(),
        selected:null, attempts:[], confirmed:[], pendingBuilds:[],
        knownObjects:new Set(), snapshotReady:false };
    const LEGIT_MIN_RETRY_MS=10;
    const placementTypes={KeyV:new Set([2,7,17]),KeyF:new Set([6])}; // entity types, not item IDs
    // TRY/s counts placement command packets; CPS counts new server-observed
    // structures matched to those commands. No explicit ACK exists for a build.
    const MACRO_CONFIRM_WINDOW_MS=2200;
    function pruneMacroTelemetry(now=performance.now()) {
        for (const arr of [macro.attempts,macro.confirmed])
            while(arr.length && arr[0]<=now-1000)arr.shift();
        macro.pendingBuilds=macro.pendingBuilds.filter(p=>now-p.at<=MACRO_CONFIRM_WINDOW_MS);
    }
    function countMacroClick(key) {
        const now=performance.now();
        macro.attempts.push(now);
        const self=session.self;
        if(self && Number.isInteger(self.sid)) {
            macro.pendingBuilds.push({key,at:now,sid:self.sid,x:self.x,y:self.y});
            if(macro.pendingBuilds.length>250)macro.pendingBuilds.splice(0,macro.pendingBuilds.length-250);
        }
        pruneMacroTelemetry(now);
    }
    function macroAttemptCps(now=performance.now()) {
        pruneMacroTelemetry(now);
        return macro.attempts.length;
    }
    function macroCps(now=performance.now()) {
        pruneMacroTelemetry(now);
        return macro.confirmed.length;
    }
    function releaseMacroSelection(restore=true) {
        if (!macro.selected) return;
        macro.selected=null;
        session.lastAutomationAt=performance.now();
        if (connected()) {
            transmit([18]);
            if (restore) restoreWeapon();
        }
    }
    function resetPlacementTracking() {
        macro.knownObjects.clear();macro.snapshotReady=false;
        macro.pendingBuilds=[];macro.attempts=[];macro.confirmed=[];
        resetAutoPlace();
    }
    // The 19-byte structure field at bytes 2..3 is the unique entity ID,
    // NOT the player's ID. Owned structures carry the player's SID in byte 1.
    // Attribute each new structure to a pending F/V command of matching type,
    // SID, position and time. Retries for one structure count only once.
    function observePlacement(packet) {
        if(!(packet instanceof Uint8Array) || (packet.length-1)%19!==0)return;
        const now=performance.now(),self=session.self;
        for(let i=1;i+18<packet.length;i+=19){
            const type=packet[i];
            if(!placementTypes.KeyV.has(type) && !placementTypes.KeyF.has(type))continue;
            const sid=packet[i+1],id=packet[i+2]|packet[i+3]<<8;
            const key=`${type}:${sid}:${id}`;
            if(packet[i+8]&2){macro.knownObjects.delete(key);continue;}
            const fresh=!macro.knownObjects.has(key);
            macro.knownObjects.add(key);
            if(!fresh || !macro.snapshotReady || !self || sid!==self.sid)continue;
            const x=packet[i+4]|packet[i+5]<<8,y=packet[i+6]|packet[i+7]<<8;
            let match=-1;
            for(let j=0;j<macro.pendingBuilds.length;j++){
                const p=macro.pendingBuilds[j];
                if(p.sid===sid && placementTypes[p.key].has(type) &&
                    now-p.at>=0 && now-p.at<=MACRO_CONFIRM_WINDOW_MS &&
                    Math.hypot(x-p.x,y-p.y)<=190){match=j;break;}
            }
            if(match<0)continue;
            const used=macro.pendingBuilds[match];
            // A single observed structure cannot validate multiple fast retries.
            macro.pendingBuilds=macro.pendingBuilds.filter(p=>
                p.key!==used.key || p.at>used.at);
            macro.confirmed.push(now);
            if(macro.selected===used.key){
                releaseMacroSelection();
                macro.next[used.key]=now+Math.max(LEGIT_MIN_RETRY_MS,
                    settings[macroDefs[used.key].speed]);
                macro.turn=used.key==='KeyV'?1:0;
                const due=Math.min(...Object.keys(macroDefs)
                    .filter(macroActive).map(k=>macro.next[k]));
                if(Number.isFinite(due))macroWake(Math.max(1,due-performance.now()));
            }
        }
        if(self)macro.snapshotReady=true;
        pruneMacroTelemetry(now);
    }
    const macroDefs = { KeyV:{id:4, enabled:'spikeMacro', speed:'spikeMs'},
        KeyF:{id:7, enabled:'trapMacro', speed:'trapMs'} };
    function stopMacroTimer() {
        if (macro.timer !== null) clearTimeout(macro.timer);
        macro.timer = null;
    }
    function clearMacros(restore=true) {
        stopMacroTimer();
        if (restore) releaseMacroSelection(); else macro.selected=null;
        for (const key of Object.keys(macroDefs)) { macro.held[key]=false; macro.next[key]=0; }
    }
    function macroActive(key) { return macro.held[key] && settings[macroDefs[key].enabled]; }
    function macroWake(delay) {
        stopMacroTimer();
        if (!Object.keys(macroDefs).some(macroActive)) return;
        macro.timer=setTimeout(() => { macro.timer=null; runMacros(); }, Math.max(1, Math.ceil(delay)));
    }
    function runMacros() {
        stopMacroTimer();
        if (!player.alive || !connected() || document.hidden || (menu && !menu.hidden)) { clearMacros(); return; }
        if (macro.selected && (!settings.legitMacro || !macroActive(macro.selected))) releaseMacroSelection();
        if (!Object.keys(macroDefs).some(macroActive)) return;
        const now=performance.now();
        // Heal owns item selection while holding food, and gets first chance
        // at each due heal. A placement never runs in the middle of a heal.
        if (heal.phase !== 'idle' || (isEligible() && now >= heal.nextAt)) {
            evaluate();
            if (heal.phase !== 'idle') { macroWake(Math.max(1, Math.min(25, heal.until-now))); return; }
        }
        if (pauseAutoPlaceForLag(now)) {
            // Throttle only while stalled/queued/recovering; the user may keep
            // holding F/V and the macro resumes when server updates stabilize.
            macroWake(65);
            return;
        }
        const aim=currentAim();
        if (!aim) { macroWake(25); return; }
        macro.tokens=Math.min(MACRO_BURST, macro.tokens+Math.max(0,now-macro.last)*MACRO_PACKET_RATE/1000);
        macro.last=now;
        const keys=macro.turn ? ['KeyF','KeyV'] : ['KeyV','KeyF'];
        // A held Legit item owns the slot until observed placement, key release,
        // manual selection or heal preemption. Never interleave two held items.
        const key=macro.selected ? (now>=macro.next[macro.selected]?macro.selected:null) :
            keys.find(k=>macroActive(k) && now>=macro.next[k]);
        const cost=macroPacketCost();
        if (key && macro.tokens >= cost && session.ws.bufferedAmount < 65536) {
            const def=macroDefs[key];
            session.lastAutomationAt=now;
            // Legit retries use three packets; initial selection also reserves restoration.
            macro.tokens-=cost;
            if (settings.legitMacro) {
                if (!macro.selected) macro.selected=key;
                // Keep building selected across retries, without restoring weapon.
                // Reselect the same slot in case the server consumed selection.
                if (transmit([18]) && transmit([0,def.id]) && transmit([19,...aim])) countMacroClick(key);
                else releaseMacroSelection();
                macro.next[key]=now+Math.max(LEGIT_MIN_RETRY_MS,settings[def.speed]);
            } else {
                const attacking=session.attacking;
                const placement=[19,...aim];
                const packets=[...(attacking?[[18]]:[]),[0,def.id],placement,[18],
                    session.weaponPacket, attacking?[19,...aim]:[13,...aim]];
                let complete=true;
                for (const packet of packets) {
                    if (!transmit(packet)) { complete=false; break; }
                    if (packet===placement) countMacroClick(key);
                }
                if (!complete) { transmit([18]); restoreWeapon(); }
                macro.next[key]=now+settings[def.speed];
                macro.turn=key==='KeyV'?1:0;
            }
        }
        const next=macro.selected?macro.next[macro.selected]:Math.min(...Object.keys(macroDefs).filter(macroActive).map(k=>macro.next[k]));
        const budgetWait=Math.max(0,(macroPacketCost()-macro.tokens)*1000/MACRO_PACKET_RATE);
        macroWake(Math.max(1,next-performance.now(),budgetWait,session.ws.bufferedAmount>=65536?25:0));
    }
    // Smart Auto Place. Independent geometry/scoring implementation; public protocol
    // references: Astral LITE (Greasy Fork 551961) and Socket API (550560).
    // Object sizes, placement radius and latency are estimates, not server guarantees.
    const AP_RADIUS=70, AP_MAX_RANGE=230, AP_PLAYER_TTL=340, AP_OBJECT_TTL=1600;
    const AP_BURST=12, AP_BATCH_MAX=3; // Local budget, not a server throughput guarantee.
    const AP_OBJECT_RADII={1:75,2:45,3:90,4:76,5:50,6:40,7:45,8:45,9:60,
        10:40,11:40,12:0,13:45,14:90,15:50,16:54,17:42,18:45,19:80,20:80,21:60,22:59};
    // Only explicit removal records for previously observed own traps/spikes
    // are eligible. Missing/stale objects are not evidence of destruction.
    const AR_TTL=650, AR_MAX_TRIES=2, AR_TOLERANCE=20;
    const autoPlacementEnabled=()=>settings.autoPlace||settings.autoReplace;
    const ap={entities:new Map(), self:null, nextAt:0, manualUntil:0, manualItem:false,
        pending:[], attempts:[], confirmed:[], misses:[], replaceQueue:new Map(), replaced:[], timer:null, timerAt:Infinity, tick:100, lastBatchAt:-Infinity, target:null, targetUntil:0, status:'Off'};
    function resetAutoPlace() {
        if (ap.timer!==null) clearTimeout(ap.timer); ap.timer=null; ap.timerAt=Infinity;
        ap.entities.clear(); ap.self=null; ap.nextAt=0; ap.manualUntil=0;
        ap.manualItem=false; ap.replaceQueue.clear(); ap.replaced=[]; ap.pending=[]; ap.attempts=[]; ap.confirmed=[]; ap.misses=[]; ap.tick=100; ap.lastBatchAt=-Infinity; ap.target=null; ap.targetUntil=0; ap.status='Idle';
    }
    function apDistance(a,b) { return Math.hypot(a.x-b.x,a.y-b.y); }
    function apFriendly(entity,self) {
        return (entity.type===0 ? entity.id===self.id : entity.sid===self.sid) || (self.team!==0 && self.team===entity.team);
    }
    function apAngleBytes(angle) {
        const tau=2*Math.PI;
        const wrapped=((angle+Math.PI)%tau+tau)%tau;
        const n=Math.round(wrapped*65535/tau);
        return [n&255,(n>>>8)&255];
    }
    function queueAutoReplace(key, old, now) {
        if (!settings.autoReplace || !old || !ap.self || old.sid!==ap.self.sid || now-old.at>AP_OBJECT_TTL) return;
        const kind=placementTypes.KeyF.has(old.type)?'KeyF':placementTypes.KeyV.has(old.type)?'KeyV':null;
        if (!kind || ap.replaceQueue.has(key) || apDistance(old,ap.self)>AP_RADIUS+AR_TOLERANCE+85) return;
        if (ap.replaceQueue.size>=24) ap.replaceQueue.delete(ap.replaceQueue.keys().next().value);
        ap.replaceQueue.set(key,{id:key,key:kind,x:old.x,y:old.y,at:now,tries:0,last:-Infinity});
        ap.nextAt=Math.min(ap.nextAt,now);
    }
    function observeAutoPlace(packet, now) {
        if (!autoPlacementEnabled() || (packet.length-1)%19!==0) return false;
        let selfSeen=false;
        const removed=new Set();
        for (let i=1;i+18<packet.length;i+=19) {
            if (!(packet[i+8]&2)) continue;
            const key=`${packet[i]}:${packet[i+2]|packet[i+3]<<8}`;
            removed.add(key);
            queueAutoReplace(key,ap.entities.get(key),now);
            ap.entities.delete(key);
        }
        for (let i=1;i+18<packet.length;i+=19) {
            const type=packet[i], sid=packet[i+1], id=packet[i+2]|packet[i+3]<<8;
            const key=`${type}:${id}`;
            if (removed.has(key)) continue;
            const x=packet[i+4]|packet[i+5]<<8, y=packet[i+6]|packet[i+7]<<8;
            const old=ap.entities.get(key), dt=old?now-old.at:0;
            if (type!==0 && !old && ap.self && sid===ap.self.sid) {
                let match=-1, bestDistance=45;
                for (let j=0;j<ap.pending.length;j++) {
                    const p=ap.pending[j], d=apDistance(p,{x,y});
                    if (placementTypes[p.key].has(type) && d<bestDistance) { match=j; bestDistance=d; }
                }
                const confirmed=match>=0?ap.pending.splice(match,1)[0]:null;
                if (confirmed) ap.confirmed.push(now);
                // Clear the queue if the location is already rebuilt. Only count
                // REP when a matching attempted replacement was observed nearby.
                let closest=null, closestDistance=AR_TOLERANCE+8;
                for (const [rid,r] of ap.replaceQueue) {
                    const d=apDistance(r,{x,y});
                    if (placementTypes[r.key].has(type) && d<=closestDistance) { closest=rid; closestDistance=d; }
                }
                if (closest!==null) {
                    if (confirmed && confirmed.replaceId===closest) ap.replaced.push(now);
                    ap.replaceQueue.delete(closest);
                }
            }
            let vx=0,vy=0, ax=0,ay=0, motion=0, stillFrames=0;
            if (type===0 && old && old.sid===sid && dt>=15 && dt<=500) {
                const dx=x-old.x,dy=y-old.y;
                if (Math.hypot(dx,dy)/dt<=1.5) {
                    const rx=dx/dt, ry=dy/dt;
                    const reversal=rx*old.vx+ry*old.vy<0;
                    const weight=reversal?.9:.72;
                    vx=rx*weight+old.vx*(1-weight); vy=ry*weight+old.vy*(1-weight);
                    if (!reversal && old.motion>0) {
                        ax=Math.max(-.004,Math.min(.004,(vx-old.vx)/dt));
                        ay=Math.max(-.004,Math.min(.004,(vy-old.vy)/dt));
                    }
                    motion=Math.hypot(rx,ry);
                    stillFrames=motion<=.12?Math.min(10,(old.stillFrames||0)+1):0;
                }
            }
            const e={type,id,sid,x,y,state:packet[i+8],team:packet[i+12],health:packet[i+13],at:now,vx,vy,ax,ay,motion,stillFrames};
            ap.entities.set(key,e);
            if (type===0 && id===player.id) { if (dt>=20 && dt<=250) ap.tick=ap.tick*.8+dt*.2; ap.self=e; selfSeen=true; }
        }
        for (const [key,e] of ap.entities) {
            if (now-e.at>(e.type===0?AP_PLAYER_TTL:AP_OBJECT_TTL)) ap.entities.delete(key);
        }
        apExpire(now);
        return selfSeen || !!ap.self;
    }
    // Geometry is approximate; server-observed objects are the only evidence of success.
    const AP_RING=Array.from({length:120},(_,i)=>{
        const angle=i*Math.PI/60-Math.PI;
        return {angle,dx:AP_RADIUS*Math.cos(angle),dy:AP_RADIUS*Math.sin(angle)};
    });
    function apExpire(now) {
        const timeout=Math.max(100,Math.min(330,ap.tick*2.1));
        ap.pending=ap.pending.filter(p=>{
            if (now-p.at<timeout) return true;
            ap.misses.push({...p,at:now}); return false;
        });
        ap.misses=ap.misses.filter(p=>now-p.at<650).slice(-64);
        ap.confirmed=ap.confirmed.filter(t=>now-t<1000);
        ap.replaced=ap.replaced.filter(t=>now-t<1000);
        for (const [id,r] of ap.replaceQueue) {
            if (!settings.autoReplace || now-r.at>AR_TTL || (r.tries>=AR_MAX_TRIES && now-r.last>=timeout)) ap.replaceQueue.delete(id);
        }
    }
    // Bounded acceleration prediction. Short horizons are weighted more
    // heavily than uncertain distant trajectories.
    function apPredict(e,ms) {
        const t=Math.max(0,Math.min(220,ms));
        const dx=(e.vx||0)*t+(e.ax||0)*t*t*.35,dy=(e.vy||0)*t+(e.ay||0)*t*t*.35;
        const magnitude=Math.hypot(dx,dy), scale=magnitude>105?105/magnitude:1;
        return {x:e.x+dx*scale,y:e.y+dy*scale};
    }
    function apSegmentDistance(p,a,b) {
        const dx=b.x-a.x,dy=b.y-a.y;
        const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
        return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
    }
    // Finisher policy: conservative heuristic, not a server damage guarantee.
    // Health is a quantized 0..255 value; gear, healing and actual contact damage
    // are not known reliably from these snapshots. Never treat a guess as a kill.
    const AP_SPIKE_MAX_HP=12; // at most ~4.7% observed health
    const AP_SPIKE_CONTACT=74; // estimated player + spike contact distance
    function spikeFinisher(e,point,clearance,self,now,lead) {
        if (!e.trapped || !e.captureStable || e.health<=0 || e.health>AP_SPIKE_MAX_HP || e.spikePending || e.existingSpike) return false;
        if (e.age>Math.min(110,Math.max(45,ap.tick*1.1)) || now-self.at>Math.min(110,Math.max(45,ap.tick*1.1))) return false;
        if (clearance<35) return false; // reject more marginal geometry than ordinary traps
        const selfDrift=Math.hypot(self.vx||0,self.vy||0)*lead*.4;
        const uncertainty=3+e.speed*(e.age+lead)+selfDrift;
        if (uncertainty>10) return false;
        // Both the observed position and all short-horizon samples must be
        // comfortably within the estimated contact radius, not just one sample.
        return Math.max(apDistance(point,e.observed),...e.path.map(p=>apDistance(point,p)))+uncertainty<=AP_SPIKE_CONTACT;
    }
    function planAutoPlace(self, entities, now, count=2) {
        apExpire(now);
        const lead=Math.max(25,Math.min(85,ap.tick*.55));
        const origin=apPredict(self,Math.max(0,now-self.at)+lead*.4);
        const nearby=entities.filter(e=>apDistance(origin,e)<=AP_MAX_RANGE+140);
        const players=nearby.filter(e=>e.type===0 && e.id!==self.id && e.health>0 && now-e.at<=AP_PLAYER_TTL);
        const objects=nearby.filter(e=>e.type!==0 && e.type!==12 && now-e.at<=AP_OBJECT_TTL);
        const traps=objects.filter(o=>placementTypes.KeyF.has(o.type)&&apFriendly(o,self));
        const allies=players.filter(e=>apFriendly(e,self)).map(e=>apPredict(e,Math.max(0,now-e.at)+lead));
        const enemies=players.filter(e=>!apFriendly(e,self)).map(e=>{
            const age=Math.max(0,now-e.at),current=apPredict(e,age);
            // A nearby trap alone does not establish capture; require proximity
            // plus low observed speed. A moving opponent still gets trap priority.
            const speed=e.motion??Math.hypot(e.vx||0,e.vy||0);
            const trapped=traps.some(o=>apDistance(current,o)<42 && apDistance(e,o)<42 && speed<.18);
            const path=[current,...[lead,lead*1.8,lead*2.6].map(t=>trapped?current:apPredict(e,age+t))];
            const d=apDistance(origin,current),approach=d-apDistance(origin,path[2]);
            const pending=!trapped && settings.autoPlaceTrap && ap.pending.some(p=>p.key==='KeyF' && p.target===e.id &&
                path.slice(1).some((q,i)=>apSegmentDistance(p,path[i],q)<55));
            const threat=Math.max(0,180-Math.min(d,apDistance(origin,path[2])))*.4+Math.max(0,approach)*.6;
            const lock=ap.target===e.id && now<ap.targetUntil?12:0;
            const captureStable=(e.stillFrames||0)>=2 && speed<=.12 && traps.some(o=>
                apDistance(e,o)<=34 && apDistance(current,o)<=34);
            const spikePending=ap.pending.some(p=>p.key==='KeyV' && (p.target===e.id || apDistance(p,current)<AP_SPIKE_CONTACT));
            const existingSpike=objects.some(o=>placementTypes.KeyV.has(o.type) && apFriendly(o,self) && apDistance(o,current)<AP_SPIKE_CONTACT-5);
            return {current,path,trapped,captureStable,spikePending,existingSpike,observed:e,health:e.health,age,speed,d,approach,pending,id:e.id,threat:threat+lock};
        }).filter(e=>Math.min(...e.path.map(p=>apDistance(origin,p)))<=AP_MAX_RANGE)
          .sort((a,b)=>b.threat-a.threat||a.d-b.d).slice(0,4);
        if (!enemies.length) { ap.target=null; ap.status='No enemy'; return []; }
        const candidates=[], trapTargets=new Set();
        for (const r of AP_RING) {
            const point={x:origin.x+r.dx,y:origin.y+r.dy};
            if (point.x<0 || point.y<0 || allies.some(e=>apDistance(point,e)<60)) continue;
            let clearance=Infinity;
            for (const o of objects) clearance=Math.min(clearance,apDistance(point,o)-(AP_OBJECT_RADII[o.type]??48));
            if (clearance<20 || ap.pending.some(p=>apDistance(point,p)<48)) continue;
            for (const key of ['KeyF','KeyV']) {
                const trap=key==='KeyF',radius=trap?40:45;
                if (!(trap?settings.autoPlaceTrap:settings.autoPlaceSpike)) continue;
                const overlap=Math.max(0,radius-clearance);
                if (overlap>17) continue;
                const failed=ap.misses.reduce((n,p)=>n+(p.key===key && apDistance(point,p)<27?1:0),0);
                if (failed>=2) continue;
                for (const e of enemies) {
                    if (e.pending || (trap && e.trapped)) continue;
                    if (!trap && !spikeFinisher(e,point,clearance,self,now,lead)) continue;
                    const ds=e.path.map(p=>apDistance(point,p));
                    const path=Math.min(...e.path.slice(1).map((p,i)=>apSegmentDistance(point,e.path[i],p)));
                    if (path>(trap?61:78)) continue;
                    // Prefer intercepting the early trajectory over merely being
                    // close to its endpoint. Reject behind-the-target trap spots
                    // when a moving target is already leaving the area.
                    if (trap && ds[0]>45 && ds[1]>ds[0]+8 && ds[2]>ds[1]) continue;
                    const intercept=trap?Math.min(ds[1],ds[2]+8,ds[3]+18,ds[0]+5):Math.min(...ds);
                    const score=(trap?100-intercept*1.15-path*.35:110-Math.max(...ds)*1.1-e.health*.5)
                        +e.threat*.55-overlap*2.5-failed*26+Math.min(12,Math.max(0,clearance-radius)*.25);
                    // Only high-confidence finishers reach this branch. No spike
                    // fallback against free enemies, even if no trap fits.
                    const priority=trap?4:3;
                    candidates.push({key,angle:r.angle,point,score,priority,target:e.id});
                    if (trap) trapTargets.add(e.id);
                }
            }
        }
        const eligible=candidates.filter(c=>c.key==='KeyF'||!trapTargets.has(c.target));
        eligible.sort((a,b)=>b.priority-a.priority||b.score-a.score);
        const chosen=[];
        for (const c of eligible) {
            if (chosen.some(p=>apDistance(c.point,p.point)<75 ||
                p.target===c.target)) continue;
            // Allow useful spikes against another captured enemy in the same
            // batch; never replace the leading trap or send speculative fillers.
            if (chosen.length && (c.priority===1 || (c.priority===chosen[0].priority && c.score<chosen[0].score-28))) continue;
            chosen.push(c); if (chosen.length===count) break;
        }
        if (!chosen.length) ap.status=enemies.some(e=>e.pending)?'Waiting trap':enemies.some(e=>e.trapped)&&settings.autoPlaceSpike?'Waiting finisher':'No valid spot';
        return chosen;
    }
    function planAutoReplace(self,entities,now) {
        if (!settings.autoReplace) return [];
        apExpire(now);
        const lead=Math.max(25,Math.min(85,ap.tick*.55));
        const origin=apPredict(self,Math.max(0,now-self.at)+lead*.4);
        const allies=entities.filter(e=>e.type===0 && e.id!==self.id && apFriendly(e,self) && now-e.at<=AP_PLAYER_TTL)
            .map(e=>apPredict(e,Math.max(0,now-e.at)+lead));
        const candidates=[];
        for (const r of ap.replaceQueue.values()) {
            if (settings.autoPlace && !(r.key==='KeyF'?settings.autoPlaceTrap:settings.autoPlaceSpike)) continue;
            if (r.tries>=AR_MAX_TRIES || now-r.last<Math.max(100,ap.tick*2.1)) continue;
            const distance=apDistance(origin,r);
            // Direction alone cannot choose an arbitrary distance: only replace
            // if the old coordinate is close to the estimated placement ring.
            if (Math.abs(distance-AP_RADIUS)>AR_TOLERANCE) continue;
            const angle=Math.atan2(r.y-origin.y,r.x-origin.x);
            const point={x:origin.x+AP_RADIUS*Math.cos(angle),y:origin.y+AP_RADIUS*Math.sin(angle)};
            if (point.x<0 || point.y<0 || allies.some(e=>apDistance(point,e)<60) || ap.pending.some(p=>apDistance(point,p)<48)) continue;
            const radius=r.key==='KeyF'?40:45;
            if (entities.some(o=>o.type!==0 && o.type!==12 && now-o.at<=AP_OBJECT_TTL &&
                apDistance(point,o)<(AP_OBJECT_RADII[o.type]??48)+radius-17)) continue;
            // Reject positions that repeatedly failed rather than consuming
            // another cycle exclusively on the same bad location.
            if (ap.misses.filter(p=>p.key===r.key && apDistance(point,p)<27).length>=2) continue;
            candidates.push({key:r.key,angle,point,replaceId:r.id,priority:0,score:-Math.abs(distance-AP_RADIUS)-r.tries*18});
        }
        return candidates.sort((a,b)=>b.score-a.score);
    }
    // A destroyed structure is a tactical opportunity, not an unconditional
    // priority. Substitute only a nearby candidate of the same building type.
    // Unrelated repairs are deferred while a fight is being planned, including
    // while waiting for a trap to be confirmed.
    function mergePlacementPlans(combat,replacements,allowMaintenance) {
        const chosen=[], used=new Set();
        for (const c of combat) {
            const r=replacements.filter(r=>r.key===c.key && !used.has(r.replaceId) &&
                apDistance(r.point,c.point)<=18 && chosen.every(p=>apDistance(p.point,r.point)>=75) &&
                combat.every(p=>p===c||apDistance(p.point,r.point)>=75))
                .sort((a,b)=>apDistance(a.point,c.point)-apDistance(b.point,c.point))[0];
            if (r) {
                used.add(r.replaceId);
                // Never shift a vetted finisher to a different angle. A spike
                // replacement can piggyback only on the exact approved shot.
                if (c.key==='KeyV') {
                    if (apDistance(r.point,c.point)<=5) chosen.push({...c,replaceId:r.replaceId});
                    else chosen.push(c);
                } else chosen.push({...c,angle:r.angle,point:r.point,replaceId:r.replaceId});
            } else chosen.push(c);
        }
        if (allowMaintenance && !chosen.length) {
            // Rebuild at most one unrelated structure per batch, preserving
            // budget for the next incoming combat update.
            const r=replacements.find(r=>r.key==='KeyF'); // never build a speculative maintenance spike
            if (r) chosen.push(r);
        }
        return chosen;
    }
    function scheduleAutoPlace(delay) {
        if (!autoPlacementEnabled() || !player.alive || !ap.self) return;
        const due=performance.now()+Math.max(1,Math.ceil(delay));
        if (ap.timer!==null && ap.timerAt<=due) return;
        if (ap.timer!==null) clearTimeout(ap.timer);
        ap.timerAt=due;
        ap.timer=setTimeout(()=>{ ap.timer=null; ap.timerAt=Infinity; runAutoPlace(performance.now()); },Math.max(1,Math.ceil(delay)));
    }
    function runAutoPlace(now) {
        if (!autoPlacementEnabled() || !player.alive || !connected() || !ap.self) return;
        if (bed.pending && bed.unlocked && bed.origin &&
            (bed.phase==='moving' || bed.phase==='placing' || bed.phase==='await-position')) {
            ap.status='Respawn bed';scheduleAutoPlace(70);return;
        }
        if (deathReturn.phase==='moving' || deathReturn.phase==='ready') {
            ap.status='Retorno ao local da morte';scheduleAutoPlace(70);return;
        }
        if (pauseAutoPlaceForLag(now)) {
            // When the game pauses or the browser backs up outbound frames,
            // do not stack speculative builds ahead of the next heal command.
            ap.status='Lag Guard · '+networkState(now);
            scheduleAutoPlace(65);
            return;
        }
        if (now-ap.self.at>AP_PLAYER_TTL) { ap.status='Waiting update'; return; }
        // Auto Place is autonomous: loss of document focus is not a reason
        // to suspend it, but visible text fields and an open HUD are.
        // In hidden tabs, require a *fresh* authoritative player snapshot.
        if (!document.hidden && (editing({target:document.activeElement}) || (menu&&!menu.hidden))) {
            ap.status='Paused';return;
        }
        const blocked = ap.manualItem || now<ap.manualUntil ? 'Manual item' :
            macro.selected || Object.keys(macroDefs).some(macroActive) ? 'Manual macro' :
            heal.phase!=='idle' || (isEligible() && now>=heal.nextAt) ? 'Heal' : !currentAim() ? 'No aim' : '';
        if (blocked) { ap.status=blocked; scheduleAutoPlace(5); return; }
        if (now<ap.nextAt) { scheduleAutoPlace(ap.nextAt-now); return; }
        // Reserve more background bandwidth for Heal/Age Recovery. Auto Place
        // does not need to saturate the WebSocket while the game is unseen.
        const rate=document.hidden ? Math.min(240,settings.autoPlaceRate) : settings.autoPlaceRate;
        macro.tokens=Math.min(AP_BURST,macro.tokens+Math.max(0,now-macro.last)*rate/1000);
        macro.last=now;
        const attacking=session.attacking, overhead=attacking?3:2;
        const cost=overhead+3;
        const queueLimit=document.hidden?2048:65536;
        if (macro.tokens<cost || session.ws.bufferedAmount>=queueLimit) {
            ap.status=session.ws.bufferedAmount>=queueLimit?'Socket queue':'Budget';
            scheduleAutoPlace(Math.max(1,(cost-macro.tokens)*1000/rate,
                session.ws.bufferedAmount>=queueLimit?40:0));return;
        }
        const entities=[...ap.entities.values()];
        const combat=settings.autoPlace?planAutoPlace(ap.self,entities,now,AP_BATCH_MAX):[];
        const combatStatus=ap.status;
        const replacements=planAutoReplace(ap.self,entities,now);
        const candidates=mergePlacementPlans(combat,replacements,!settings.autoPlace||combatStatus==='No enemy');
        if (!settings.autoPlace && settings.autoReplace && settings.autoPlaceSpike && replacements.some(r=>r.key==='KeyV')) {
            const finishers=planAutoPlace(ap.self,entities,now,AP_BATCH_MAX).filter(c=>c.key==='KeyV');
            const matched=mergePlacementPlans(finishers,replacements,false).filter(c=>c.replaceId!==undefined);
            if (matched.length) candidates.splice(0,candidates.length,...matched);
        }
        if (!candidates.length) {
            if (!settings.autoPlace || combatStatus==='No enemy') {
                if (ap.replaceQueue.size) ap.status='Replace waiting';
                else if (!settings.autoPlace) ap.status='Replace idle';
            }
            scheduleAutoPlace(document.hidden?35:8);return;
        }
        const capacity=Math.floor((macro.tokens-overhead)/3);
        // First placement is immediate. During sustained placement, amortize the
        // weapon/aim restore across two or three distinct positions when available.
        const target=Math.min(candidates.length,2);
        const wait=(overhead+3*target-macro.tokens)*1000/rate;
        if (!candidates[0].replaceId && settings.autoPlaceMs<=5 && now-ap.lastBatchAt<100 && capacity<target && wait>0 && wait<=13) {
            ap.status='Batch'; scheduleAutoPlace(wait); return;
        }
        const plans=candidates.slice(0,Math.min(AP_BATCH_MAX,capacity));
        ap.nextAt=now+settings.autoPlaceMs; ap.lastBatchAt=now;
        // Restore native weapon and aim once per batch.
        macro.tokens-=overhead+3*plans.length; session.lastAutomationAt=now;
        let complete=!attacking||transmit([18]);
        for (const plan of plans) {
            if (!complete) break;
            if (!transmit([0,macroDefs[plan.key].id]) || !transmit([19,...apAngleBytes(plan.angle)])) { complete=false; break; }
            apCps(now); ap.attempts.push(now);
            ap.pending.push({...plan.point,key:plan.key,target:plan.target,at:now,replaceId:plan.replaceId});
            if (plan===plans[0] && plan.target!==undefined) { ap.target=plan.target; ap.targetUntil=now+220; }
            if (plan.replaceId) {
                const r=ap.replaceQueue.get(plan.replaceId);
                if (r) { r.tries++; r.last=now; }
                ap.status=plan.key==='KeyF'?'Replace Trap':'Replace Spike';
            } else {
                if (!plans[0].replaceId) ap.status=plan.key==='KeyF'?'Trap':'Spike';
            }
            if (!transmit([18])) { complete=false; break; }
        }
        if (!complete) transmit([18]);
        restoreWeapon();
        if (!complete) ap.status='Send failed';
        scheduleAutoPlace(Math.max(1,ap.nextAt-performance.now()));
    }
    function apCps(now=performance.now()) {
        while (ap.attempts.length && ap.attempts[0]<=now-1000) ap.attempts.shift();
        return ap.attempts.length;
    }
    function editing(event) {
        const el=event.target;
        return !!(el && (el.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(el.tagName)));
    }
    window.addEventListener('keydown', event=>{
        if (!editing(event) && player.alive && !(menu && !menu.hidden) &&
            !event.ctrlKey && !event.altKey && !event.metaKey) {
            if (['Digit1','Numpad1'].includes(event.code)) rememberSlot(0);
            if (['Digit2','Numpad2'].includes(event.code)) rememberSlot(1);
        }
        const def=macroDefs[event.code];
        if (!def || !settings[def.enabled] || !player.alive || !connected() || document.hidden ||
            editing(event) || event.ctrlKey || event.altKey || event.metaKey || (menu && !menu.hidden)) return;
        event.preventDefault(); event.stopImmediatePropagation();
        if (bed.pending && (bed.phase==='moving' || bed.phase==='placing'))
            abortSpawnBed('Manual macro');
        if (event.repeat || macro.held[event.code]) return;
        if(deathReturn.phase==='moving'||deathReturn.phase==='ready'){
            stopReturnMovement();deathReturn.phase='ready';
            deathReturn.route=[];deathReturn.step=0;
            deathReturn.nextAt=performance.now()+25;
            deathReturn.status='Retorno pausado pela macro';
        }
        macro.held[event.code]=true; macro.next[event.code]=performance.now(); runMacros();
    },true);
    window.addEventListener('keyup', event=>{
        if (!macroDefs[event.code] || !macro.held[event.code]) return;
        macro.held[event.code]=false; event.preventDefault(); event.stopImmediatePropagation();
        if (macro.selected===event.code) releaseMacroSelection();
        if (Object.keys(macroDefs).some(macroActive)) runMacros(); else stopMacroTimer();
    },true);
    window.addEventListener('blur',()=>{
        if(session.attacking && connected())transmit([18]);
        session.attacking=false;
        clearMacros();
        // Keyup may not be delivered after switching tabs. Stop a movement
        // that was handed off manually, but keep bed navigation pending.
        if (bed.handoffMove) {transmit([15]);bed.handoffMove=false;}
        bed.moveKeys.clear();
        // A missed keyup after changing tabs must not keep return paused.
        if(deathReturn.manualMove){
            transmit([15]);deathReturn.manualMove=false;
            deathReturn.nextAt=0;
        }
    });
    const bedMoveKeys=new Set(['KeyW','KeyA','KeyS','KeyD',
        'ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
    window.addEventListener('keydown', event=>{
        if(!bedMoveKeys.has(event.code) || editing(event)) return;
        if(bed.locked && !event.ctrlKey && !event.altKey && !event.metaKey) {
            // Remember the physical hold even when the game never sees keydown.
            bed.moveKeys.add(event.code);
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }
        if(!event.repeat) bed.moveKeys.add(event.code);
    },true);
    window.addEventListener('keyup',event=>{
        if (!bedMoveKeys.has(event.code)) return;
        bed.moveKeys.delete(event.code);
        if (bed.handoffMove) {
            // A keydown intercepted during navigation never reached the game;
            // send the corresponding release even if native keyup does nothing.
            const keys=bed.moveKeys;
            const x=Number(keys.has('KeyD')||keys.has('ArrowRight'))-
                    Number(keys.has('KeyA')||keys.has('ArrowLeft'));
            const y=Number(keys.has('KeyS')||keys.has('ArrowDown'))-
                    Number(keys.has('KeyW')||keys.has('ArrowUp'));
            if (x || y) transmit([1,...apAngleBytes(Math.atan2(y,x))]);
            else {transmit([15]);bed.handoffMove=false;}
        }
        // Keep native keyup visible, too; it may update the game's own state.
    },true);
    document.addEventListener('focusin',event=>{ if (editing(event)) clearMacros(); });
    function readPacket(raw) {
        if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
        if (ArrayBuffer.isView(raw)) return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
        return null;
    }
    // Upgrade profiles: learn choices from server offers, never guess unavailable items.
    const validId = id => Number.isInteger(id) && id >= 0 && id <= 255;
    const ITEM_NAMES = ['Tool Hammer','Stone Sword','Stone Spear','Stone Axe','Musket','Wood Wall','Boost','Spike','Platform','Trap','Apple','Shield','Cookie','Stick','Windmill','Hammer','Cosy Bed','Katana','Castle Spike','Powermill','Hard Spike','Turret','Cherry Wood Farm','Wood Farm','Berry Farm','Stone Farm','Bow','XBow','Naginata','Castle Wall','Great Axe','Bat'];
    const itemName = id => ITEM_NAMES[id] ? `${ITEM_NAMES[id]} (#${id})` : `Item #${id}`;
    const profileKey = PREFIX + 'profiles_v1';
    let profiles = [], selectedProfile = '';
    try {
        const saved = JSON.parse(localStorage.getItem(profileKey) || '{}');
        if (Array.isArray(saved.profiles)) profiles = saved.profiles.filter(p => p && typeof p.name === 'string' && Array.isArray(p.items))
            .slice(0, 30).map(p => ({name:p.name.trim().slice(0,32),items:p.items.slice(0,32).map(id => validId(id) ? id : null)}))
            .filter(p => p.name && p.items.some(validId));
        if (profiles.some(p => p.name === saved.selected)) selectedProfile = saved.selected;
    } catch (_) {}
    const upgrades = {
        stage:0, offer:[], signature:'', consumed:false, choices:[],
        // The server can send an offer around a fast death/respawn transition.
        preSpawn:null, age:0, lastChosenAge:-1, lastChoiceAt:-Infinity,
        lastClearAt:-Infinity,
        // Track unacknowledged automatic choices. Sending to WebSocket is not
        // proof that the server accepted an upgrade during a fast respawn.
        pendingPick:null, retryTimer:null,
    };
    const PRESPAWN_OFFER_MS=3500;
    const PICK_RETRY_GAPS_MS=[170,340];
    function clearUpgradeRetry() {
        if (upgrades.retryTimer!==null) clearTimeout(upgrades.retryTimer);
        upgrades.retryTimer=null;
        upgrades.pendingPick=null;
    }
    function scheduleUpgradeRetry() {
        if (upgrades.retryTimer!==null) clearTimeout(upgrades.retryTimer);
        upgrades.retryTimer=null;
        const p=upgrades.pendingPick;
        if (!p || p.tries>=3) return;
        upgrades.retryTimer=setTimeout(()=>{
            upgrades.retryTimer=null;
            retryUpgradeChoice();
        },Math.max(1,Math.ceil(p.nextAt-performance.now())));
    }
    function retryUpgradeChoice(now=performance.now()) {
        const p=upgrades.pendingPick;
        if (!p) return;
        // Never let a retry belonging to an old life or profile select a new
        // upgrade. Any offer for the next stage or bar clear ends these retries.
        if (!settings.autoPick || !player.alive || !connected() ||
            selectedProfile!==p.profile || upgrades.stage!==p.stage+1 ||
            upgrades.signature!==p.signature || !upgrades.consumed) {
            clearUpgradeRetry();return;
        }
        if (now<p.nextAt) return;
        if (p.tries>=3) {clearUpgradeRetry();return;}
        // Avoid enqueueing another upgrade request behind congested traffic.
        if (session.ws.bufferedAmount>=4096) {
            p.nextAt=now+120;
            scheduleUpgradeRetry();
            return;
        }
        if (transmit([14,p.id])) p.tries++;
        p.nextAt=now+(PICK_RETRY_GAPS_MS[p.tries-1]||340);
        scheduleUpgradeRetry();
    }
    function saveProfiles() {
        try { localStorage.setItem(profileKey, JSON.stringify({profiles, selected:selectedProfile})); return true; }
        catch (_) { return false; }
    }
    function resetUpgrades(clearChoices, preservePreSpawn=false) {
        profileStatus = '';
        const pending = preservePreSpawn && upgrades.preSpawn &&
            performance.now()-upgrades.preSpawn.at <= PRESPAWN_OFFER_MS ? upgrades.preSpawn : null;
        clearUpgradeRetry();
        upgrades.stage=0; upgrades.offer=[]; upgrades.signature=''; upgrades.consumed=false;
        upgrades.age=0; upgrades.lastChosenAge=-1;
        upgrades.lastChoiceAt=-Infinity; upgrades.lastClearAt=-Infinity;
        upgrades.preSpawn=pending;
        if (clearChoices) upgrades.choices=[];
        refreshProfiles();
    }
    function recordChoice(id, automatic=false) {
        if (!player.alive || upgrades.consumed || !upgrades.offer.includes(id)) return false;
        profileStatus = '';
        const stage=upgrades.stage;
        const signature=upgrades.signature;
        upgrades.choices[upgrades.stage] = id;
        if (id===SPAWN_BED_ID) bed.unlocked=true;
        upgrades.stage++;
        // An upgrade has been chosen: a Yes prompt no longer serves a purpose.
        finishTargetNotice();
        upgrades.lastChoiceAt=performance.now();
        upgrades.lastChosenAge=upgrades.age;
        upgrades.consumed=true;
        upgrades.offer=[];
        clearUpgradeRetry();
        if (automatic) {
            upgrades.pendingPick={id,stage,signature,profile:selectedProfile,
                tries:1,nextAt:performance.now()+PICK_RETRY_GAPS_MS[0]};
            scheduleUpgradeRetry();
        }
        refreshProfiles();
        return true;
    }
    function autoPick() {
        // Upgrade selection does not change the equipped weapon. Do not let
        // Legit Heal's hold timer block a fresh upgrade offer indefinitely.
        if (!settings.autoPick || !player.alive || upgrades.consumed ||
            !upgrades.offer.length || !connected()) return;
        const profile=profiles.find(p=>p.name===selectedProfile);
        const id=profile?.items[upgrades.stage];
        if (!validId(id) || !upgrades.offer.includes(id)) return;
        if (transmit([14,id])) recordChoice(id,true);
    }
    function receiveOffer(ids) {
        if (!Array.isArray(ids)) return;
        const offered=[...new Set(ids.filter(validId))];
        if (!offered.length) return;
        const now=performance.now();
        if (!player.alive) {
            // Save only the very recent pre-spawn offer; never send packets
            // until the server confirms our new player ID.
            upgrades.preSpawn={ids:offered,at:now};
            return;
        }
        const signature=offered.slice().sort((a,b)=>a-b).join(',');
        // Distinguish duplicate delivery from a new level. A level increase
        // can happen in the same frame as respawn: never require 150ms of
        // waiting if the server has already reported a newer age.
        if (signature===upgrades.signature && upgrades.consumed &&
            !(upgrades.lastClearAt>upgrades.lastChoiceAt ||
              upgrades.age>upgrades.lastChosenAge)) return;
        // A new offer replaces any unconfirmed retry from the previous stage.
        clearUpgradeRetry();
        upgrades.signature=signature;
        upgrades.consumed=false;
        upgrades.offer=offered;
        refreshProfiles();
        autoPick();
    }
    function noteUpgradeAge(packet) {
        // Resource opcode 8 contains XP in little-endian bytes 1..4.
        // Same conversion as the game's level/age display; do not use raw XP
        // (which changes within a level) to unlock duplicate upgrade offers.
        if (!(packet instanceof Uint8Array) || packet.length<5 || !player.alive) return;
        const xp=(packet[1] | packet[2]<<8 | packet[3]<<16 | packet[4]<<24)>>>0;
        const age=Math.floor(Math.pow(Math.log1p(xp),2.4)/13);
        if (Number.isFinite(age)) upgrades.age=Math.max(upgrades.age,age);
    }
    function clearUpgradeBar() {
        if (!player.alive) return;
        clearUpgradeRetry();
        upgrades.offer=[];
        upgrades.signature='';
        upgrades.lastClearAt=performance.now();
        upgrades.consumed=false;
        refreshProfiles();
    }
    let profileStatus = '';
    function refreshProfiles() {
        if (!menu) return;
        const select = menu.querySelector('#gpt-pick-profile');
        const status = menu.querySelector('#gpt-pick-status');
        const list = menu.querySelector('#gpt-pick-items');
        if (!select || !status || !list) return;
        const options = [{name:'', label:'Select profile'}, ...profiles.map(p => ({name:p.name,label:p.name}))];
        if (select.options.length !== options.length || options.some((p,i) => select.options[i].value !== p.name)) {
            select.replaceChildren(...options.map(p => { const e=document.createElement('option'); e.value=p.name; e.textContent=p.label; return e; }));
        }
        select.value = selectedProfile;
        const profile = profiles.find(p => p.name === selectedProfile);
        list.textContent = profile ? profile.items.map((id,i) => `${i+1}. ${validId(id)?itemName(id):'Manual'}`).join('\n') : '';
        const count = upgrades.choices.filter(validId).length;
        status.textContent = profileStatus || `${count} recorded${upgrades.offer.length ? ' • Choose an item' : ''}`;
        status.title = upgrades.choices.map((id,i) => `${i+1}. ${itemName(id)}`).join('\n');
        menu.querySelector('#gpt-pick-save').disabled = !count;
        menu.querySelector('#gpt-pick-delete').disabled = !profile;
    }
    // FUN: change the nickname once per observed death, before native Play.
    const GOOFY_NAMES=Object.freeze([
        'Jimothy','Tung Tung','Tralalero','Cappuccino','Brr Patapim',
        'Bombardino','Chimpanzini','Lirili Larila','Bananini','Crocodilo',
        '67 Goblin','41 Nugget','Aura Farmer','Chill Guy','Train Dog',
        'Chicken Jockey','Skibidi CEO','Ohio NPC','Sigma Potato','Rizz Goblin',
        'Mewing Fish','Unc 3000','Goofy Ahh','Lil Microwave','Toaster 67',
        'Lag Goblin','WiFi Potato','Bed CEO','Respawn NPC','Spiky Nugget',
        'Moltbot','Brdyshch','Petrovich','Syomga','Blox Banana',
        'Dr Nugget','Bread Lord','Silly Goose','Bonk CEO','Mr Waffles',
        'Bing Bong','Rizzasaurus','Soggy Toast','Aura Minus','No Brain',
        'Potato 67','Lil Pickle','Meme Goblin','Bob the Blob','Goofy Bean'
    ]);
    const SMART_NAME_POOLS=Object.freeze({
        streak:['Not Again','Respawn CEO','Death Streak','Again Bro','Free Kill','Death Enjoyer'],
        fast:['Any% Death','Speedrun Death','Spawn Camper','Instant RIP','Loading RIP','Fastest NPC'],
        long:['Final Boss','Ancient Potato','Old Man Sigma','Retired NPC','Fossil CEO','Immortal-ish'],
        lag:['Ping Enjoyer','McDonalds WiFi','Lag Goblin','Packet Potato','WiFi Toaster','Buffer Boss'],
        bed:['Homeless NPC','Bedless Sigma','No Bed Bro','Rent Due','Bed Evicted','Floor Enjoyer'],
        spike:['Spike Magnet','Cactus Enjoyer','Spiky Potato','Hedgehog CEO','Prickle NPC','Spike Tourist']
    });
    const SMART_PREFIX=['Goofy','Sigma','Unc','Rizz','Lil','Dr','CEO','Sleepy','Lag','NPC','Mega','Tiny','Silly','Broke','Unpaid','67','Ohio','Aura','Skibidi','Cursed'];
    const SMART_SUFFIX=['Potato','Goblin','Toaster','Nugget','Microwave','Pickle','Waffle','Bean','Pigeon','Fish','Rat','Bread','Banana','CEO','NPC','Penguin','Blob','Duck','Clown','Frog'];
    const GOOFY_HISTORY_KEY=PREFIX+'goofy_name_history_v1';
    let goofyHistory=[];
    try{
        const saved=JSON.parse(sessionStorage.getItem(GOOFY_HISTORY_KEY)||'[]');
        if(Array.isArray(saved))goofyHistory=saved.filter(n=>typeof n==='string').slice(-100);
    }catch(_){}
    const smartLife={startedAt:null,streak:0,context:'',bedIds:new Set(),bedLost:false};
    function resetSmartLife(server=false){
        smartLife.startedAt=null;smartLife.bedIds.clear();smartLife.bedLost=false;
        if(server){smartLife.streak=0;smartLife.context='';}
    }
    function observeSmartBed(packet){
        if(!player.alive || !session.self || !(packet instanceof Uint8Array) ||
            (packet.length-1)%19!==0)return;
        for(let i=1;i+18<packet.length;i+=19){
            if(packet[i]!==SPAWN_BED_ENTITY_TYPE || packet[i+1]!==session.self.sid)continue;
            const id=packet[i+2]|packet[i+3]<<8;
            if(packet[i+8]&2){
                if(smartLife.bedIds.delete(id))smartLife.bedLost=true;
            }else smartLife.bedIds.add(id);
        }
    }
    function captureSmartDeath(now=performance.now()){
        const duration=smartLife.startedAt===null?null:now-smartLife.startedAt;
        smartLife.streak=duration!==null && duration<45000 ? smartLife.streak+1:0;
        const nearSpike=session.self && [...deathReturn.objects.values()].some(o=>
            [2,7,17].includes(o.type) && now-o.at<10000 &&
            Math.hypot(o.x-session.self.x,o.y-session.self.y)<100);
        smartLife.context=smartLife.bedLost?'bed':
            lag.spikeCount>0 && now-lag.spikeAt<5000?'lag':
            nearSpike?'spike':smartLife.streak>=3?'streak':
            duration!==null && duration<12000?'fast':
            duration!==null && duration>300000?'long':'';
    }
    function rememberGoofyHistory(name){
        goofyHistory=goofyHistory.filter(n=>n!==name);
        goofyHistory.push(name);goofyHistory=goofyHistory.slice(-100);
        try{sessionStorage.setItem(GOOFY_HISTORY_KEY,JSON.stringify(goofyHistory));}catch(_){}
    }
    const GOOFY_BACKUP_KEY=PREFIX+'goofy_nickname_backup_v1';
    const goofy={original:null,applied:null,last:null,pending:false};
    try{
        const saved=JSON.parse(sessionStorage.getItem(GOOFY_BACKUP_KEY)||'null');
        if(saved && typeof saved.original==='string'){
            goofy.original=saved.original;
            goofy.applied=typeof saved.applied==='string'?saved.applied:null;
            goofy.last=typeof saved.last==='string'?saved.last:null;
        }
    }catch(_){}
    function saveGoofyBackup(){
        try{
            if(goofy.original===null)sessionStorage.removeItem(GOOFY_BACKUP_KEY);
            else sessionStorage.setItem(GOOFY_BACKUP_KEY,JSON.stringify({
                original:goofy.original,applied:goofy.applied,last:goofy.last
            }));
        }catch(_){}
    }
    function nicknameInput(){
        const el=document.getElementById('nickname');
        return el && typeof el.value==='string' ? el:null;
    }
    function setGameNickname(el,value){
        if(el.value===value)return;
        el.value=value;
        el.dispatchEvent(new Event('input',{bubbles:true}));
        el.dispatchEvent(new Event('change',{bubbles:true}));
    }
    function rememberOriginalNickname(){
        if(goofy.original!==null)return true;
        const el=nicknameInput();
        if(!el)return false;
        goofy.original=el.value;
        saveGoofyBackup();return true;
    }
    function chooseGoofyNickname(maxLength,random=Math.random){
        const cap=Number.isInteger(maxLength)&&maxLength>0?maxLength:16;
        const eligible=pool=>[...new Set(pool.map(n=>n.slice(0,cap)))].filter(n=>
            n!==goofy.last && n!==goofy.original && !goofyHistory.includes(n));
        let choices=settings.smartNames ? eligible(SMART_NAME_POOLS[smartLife.context]||[]):[];
        if(!choices.length){
            const pool=[...GOOFY_NAMES];
            for(const a of SMART_PREFIX)for(const b of SMART_SUFFIX)pool.push(a+' '+b);
            choices=eligible(pool);
        }
        // A very short server name limit may exhaust all distinct strings.
        // Relax history only when the pool is exhausted, never repeat last.
        if(!choices.length)choices=[...new Set(GOOFY_NAMES.map(n=>n.slice(0,cap)))].filter(n=>
            n!==goofy.last && n!==goofy.original);
        if(!choices.length)return null;
        return choices[Math.min(choices.length-1,Math.floor(random()*choices.length))];
    }
    function prepareGoofyNickname(){
        if(!settings.goofyNames || player.alive || !goofy.pending)return false;
        const el=nicknameInput();
        if(!el || el.disabled || !rememberOriginalNickname())return false;
        if(goofy.applied===null){
            goofy.applied=chooseGoofyNickname(el.maxLength);
            if(goofy.applied===null)return false;
            goofy.last=goofy.applied;
            rememberGoofyHistory(goofy.applied);
            saveGoofyBackup();
        }
        setGameNickname(el,goofy.applied);return true;
    }
    function restoreGoofyNickname(disable=false){
        if(disable)goofy.pending=false;
        if(goofy.original===null)return true;
        const el=nicknameInput();
        if(!el)return false;
        const generated=goofy.applied;
        // Restore only this tab's menu and our own persisted temporary value.
        setGameNickname(el,goofy.original);
        try{
            if(generated!==null && localStorage.getItem('nickname')===generated)
                localStorage.setItem('nickname',goofy.original);
        }catch(_){}
        goofy.applied=null;
        if(disable){goofy.original=null;goofy.last=null;}
        saveGoofyBackup();return true;
    }
    function finishGoofySpawn(){
        goofy.pending=false;
        if(goofy.applied!==null)
            setTimeout(()=>{if(!goofy.pending)restoreGoofyNickname(!settings.goofyNames);},0);
    }
    function syncGoofyNickname(){
        if(!settings.goofyNames){
            if(goofy.original!==null)restoreGoofyNickname(true);
        }else if(goofy.applied!==null && !goofy.pending){
            restoreGoofyNickname(false);
        }else rememberOriginalNickname();
    }
    window.addEventListener('click',event=>{
        if(event.target?.closest?.('#play'))prepareGoofyNickname();
    },true);
    window.addEventListener('keydown',event=>{
        if(event.key==='Enter' && !event.repeat && playAvailable(document.querySelector('#play')) &&
            (event.target===nicknameInput() || !event.target?.closest?.('input,textarea,select,button,[contenteditable]')))
            prepareGoofyNickname();
    },true);
    window.addEventListener('load',syncGoofyNickname,{once:true});
    // AUTO SPAWN: use the game's own Play button after a confirmed death.
    // No synthetic login packets, and no clicks while alive. A bounded retry
    // tolerates the delay between the death packet and the native menu opening.
    const autoRespawn={armed:false,timer:null,token:0,attempts:0,startedAt:0,
        lastClickAt:-Infinity,connectionEpoch:0,observer:null};
    function watchAutoRespawnPlay(){
        if(autoRespawn.observer || typeof MutationObserver!=='function' ||
            !document.documentElement)return;
        try{
            autoRespawn.observer=new MutationObserver(records=>{
                if(!autoRespawn.armed)return;
                // The renderer may create/unhide #play after the death packet.
                // Avoid scanning the DOM for unrelated attribute changes.
                const changed=records.some(r=>r.type==='childList' ||
                    r.target?.id==='play' || r.target?.contains?.(document.querySelector('#play')));
                if(changed)tryAutoRespawn(true);
            });
            autoRespawn.observer.observe(document.documentElement,{childList:true,
                subtree:true,attributes:true,
                attributeFilter:['class','style','hidden','disabled']});
        }catch(_){autoRespawn.observer=null;}
    }
    function stopAutoRespawn(){
        ++autoRespawn.token;
        if(autoRespawn.timer!==null)clearTimeout(autoRespawn.timer);
        autoRespawn.timer=null;autoRespawn.armed=false;
        if(autoRespawn.observer){autoRespawn.observer.disconnect();autoRespawn.observer=null;}
    }
    function playAvailable(el){
        if(!el || !el.isConnected || el.disabled || el.getAttribute('aria-disabled')==='true')return false;
        if(typeof el.getClientRects==='function' && !el.getClientRects().length)return false;
        // A hidden ancestor can leave the button's own display value unchanged.
        for(let node=el;node && node.nodeType===1;node=node.parentElement){
            const css=getComputedStyle(node);
            if(css.display==='none'||css.visibility==='hidden'||css.visibility==='collapse')return false;
        }
        return true;
    }
    function wakeAutoRespawn(delay){
        if(autoRespawn.timer!==null)clearTimeout(autoRespawn.timer);
        if(!autoRespawn.armed)return;
        const token=autoRespawn.token;
        autoRespawn.timer=setTimeout(()=>{
            if(token!==autoRespawn.token)return;
            autoRespawn.timer=null;
            tryAutoRespawn();
        },Math.max(10,Math.ceil(delay)));
    }
    function tryAutoRespawn(fromDomMutation=false){
        if(!autoRespawn.armed)return;
        if(!settings.autoRespawn||player.alive||!connected()||
            autoRespawn.connectionEpoch!==session.connectionEpoch){
            stopAutoRespawn();return;
        }
        const now=performance.now();
        // Allow native death UI handlers to expose Play before the first click.
        if(!fromDomMutation && now-autoRespawn.startedAt<35){
            wakeAutoRespawn(35-(now-autoRespawn.startedAt));return;
        }
        // Stop repeated attempts if the server does not respawn us; a fresh
        // death event in the next life arms a new series automatically.
        if(now-autoRespawn.startedAt>12000||autoRespawn.attempts>=10){
            stopAutoRespawn();return;
        }
        if(now-autoRespawn.lastClickAt>=850){
            const play=document.querySelector('#play');
            if(playAvailable(play)){
                try{prepareGoofyNickname();play.click();autoRespawn.attempts++;autoRespawn.lastClickAt=now;}
                catch(_){}
            }
        }
        wakeAutoRespawn(autoRespawn.lastClickAt===-Infinity?100:Math.max(100,850-(now-autoRespawn.lastClickAt)));
    }
    function startAutoRespawn(){
        stopAutoRespawn();
        if(!settings.autoRespawn||player.alive||!connected())return;
        autoRespawn.armed=true;autoRespawn.connectionEpoch=session.connectionEpoch;
        autoRespawn.startedAt=performance.now();autoRespawn.attempts=0;
        autoRespawn.lastClickAt=-Infinity;
        // A DOM mutation can wake Auto Spawn even when background timers are
        // throttled. The native button still needs to become available.
        watchAutoRespawnPlay();
        wakeAutoRespawn(35);
    }
    // Player detection stays active, but a confirmation is useful only while
    // Auto Pick is OFF and no upgrade has been selected in the current life.
    // Display at most ONE prompt per life, not one per player encounter.
    const TARGET_NOTICE_RETENTION_MS=10000;
    const targetNotice={node:null,players:new Map(),shownThisLife:false,lastDebugAt:-Infinity};
    function targetNoticeEligible() {
        return player.alive && settings.notifyTargets && !settings.autoPick &&
            !targetNotice.shownThisLife && upgrades.stage===0 &&
            !upgrades.consumed && !upgrades.choices.some(validId);
    }
    function finishTargetNotice() {
        targetNotice.shownThisLife=true;
        hideTargetNotice();
    }
    function hideTargetNotice() {
        if(targetNotice.node) targetNotice.node.remove();
        targetNotice.node=null;
    }
    function resetTargetNotice() {
        hideTargetNotice();
        targetNotice.players.clear();targetNotice.shownThisLife=false;
        targetNotice.lastDebugAt=-Infinity;
    }
    function showTargetNotice() {
        if(!document.body || document.hidden || !connected() ||
           !targetNoticeEligible() || targetNotice.node) return false;
        const box=document.createElement('section');
        box.id='nx-target-notice';box.setAttribute('role','alert');
        box.style.cssText='position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:2147483647;'+
            'width:min(340px,calc(100vw - 36px));padding:13px 14px;'+
            'background:linear-gradient(145deg,#142638,#09131f);'+
            'color:#eaffff;border:1px solid #4fded1;border-radius:13px;'+
            'box-shadow:0 12px 35px #000b;font:13px Arial,sans-serif;';
        const headline=document.createElement('strong');
        headline.textContent='NEXUS · Jogador detectado';
        headline.style.cssText='display:block;color:#83fff1;font-size:14px;margin-bottom:6px';
        const message=document.createElement('p');
        message.style.cssText='margin:0 0 10px;line-height:1.45';
        message.textContent='Outro jogador detectado. Ativar Auto Pick?';
        const actions=document.createElement('div');
        actions.style.cssText='display:flex;gap:8px;';
        const yes=document.createElement('button');yes.type='button';yes.textContent='Yes';
        yes.style.cssText='flex:1;background:#52daca;color:#082026;border:0;border-radius:7px;padding:8px;font-weight:bold;cursor:pointer';
        const no=document.createElement('button');no.type='button';no.textContent='Agora não';
        no.style.cssText='flex:1;background:#26394a;color:#eaffff;border:1px solid #526c77;border-radius:7px;padding:8px;cursor:pointer';
        yes.addEventListener('click',()=>{
            finishTargetNotice();
            editSetting('autoPick',true);
            if(!selectedProfile) {
                profileStatus='Auto Pick ativado — selecione um perfil de upgrades';
                refreshProfiles();
            }
        });
        no.addEventListener('click',finishTargetNotice);
        actions.append(yes,no);box.append(headline,message,actions);
        document.body.appendChild(box);targetNotice.node=box;
        targetNotice.shownThisLife=true; // prevent another prompt until respawn
        return true;
    }
    function flushTargetNotice() {
        if(targetNotice.node || document.hidden || !targetNoticeEligible()) return;
        const now=performance.now();
        if([...targetNotice.players.values()].some(t=>now-t<2500))
            showTargetNotice();
    }
    function observeTargetProximity(packet) {
        if(!player.alive) {resetTargetNotice();return;}
        if(!settings.notifyTargets) {
            hideTargetNotice();targetNotice.players.clear();return;
        }
        if(settings.autoPick || upgrades.stage>0 || upgrades.choices.some(validId))
            hideTargetNotice();
        if(!(packet instanceof Uint8Array) || (packet.length-1)%19!==0) return;
        const now=performance.now();
        for(let i=1;i+18<packet.length;i+=19) {
            if(packet[i]!==0) continue;
            const id=packet[i+2]|packet[i+3]<<8;
            if(id===player.id) continue;
            if(packet[i+8]&2) {
                // Mark this player unseen without forgetting the encounter;
                // only a long absence permits a new alert for the same ID.
                if(targetNotice.players.has(id))
                    targetNotice.players.set(id,now-2501);
                continue;
            }
            targetNotice.players.set(id,now);
        }
        for(const [id,lastAt] of targetNotice.players) {
            if(now-lastAt>TARGET_NOTICE_RETENTION_MS)
                targetNotice.players.delete(id);
        }
        // Update promptly on every server packet, never on an artificial timer.
        flushTargetNotice();
        if(now-targetNotice.lastDebugAt>=220) {
            const status=menu?.querySelector('#nx-target-debug');
            if(status) {
                const observed=[...targetNotice.players.values()].filter(t=>now-t<2500).length;
                status.textContent=observed ?
                    `Jogadores detectados: ${observed}` : 'Nenhum jogador detectado';
            }
            targetNotice.lastDebugAt=now;
        }
    }
    let lastMenuSnapshotPaint=-Infinity;
    function onGameMessage(event) {
        // A superseded server may still deliver delayed messages. Ignore them.
        if(event.currentTarget && event.currentTarget!==session.ws)return;
        let packet = readPacket(event.data);
        if (!packet && typeof event.data === 'string') {
            try { packet = JSON.parse(event.data); } catch (_) { return; }
        }
        if (!packet || !packet.length) return;
        const id = Number(packet[0]);
        let ownSnapshotProcessed=false;
        if (id === 35) { // spawn
            finishGoofySpawn();
            resetSmartLife();smartLife.startedAt=performance.now();
            resetTargetNotice();
            stopAutoRespawn();
            // Some fast respawns can skip the death message entirely. Preserve
            // the last position only when this was already an active life on
            // the SAME WebSocket; new connections start with player.alive=false.
            if(player.alive && settings.returnAfterBed)
                captureReturnDeath();
            clearMacros(false);
            resetPlacementTracking();
            cancelHeal(false);
            resetHealTelemetry();
            resetLagGuard();
            resetKatanaGuard();
            resetCombatState();
            player.id = Number(packet[1]);
            player.alive = Number.isInteger(player.id) && player.id >= 0;
            player.health = 100;
            resetRespawnHat();
            armAgeRecoverySpawn();
            resetSpawnBed();
            onReturnRespawn();
            resetUpgrades(true,true);
            // Server offers can precede the spawn notification in fast rounds.
            const pending=upgrades.preSpawn;
            upgrades.preSpawn=null;
            if (pending && performance.now()-pending.at<=PRESPAWN_OFFER_MS) receiveOffer(pending.ids);
            updateHealth();
        } else if (id === 19) { // death
            if(player.alive){
                captureSmartDeath();
                if(goofy.applied!==null)restoreGoofyNickname(false);
                goofy.pending=true;
            }
            resetTargetNotice();
            noteAgeRecoveryDeath();
            captureReturnDeath();
            // Preserve the last confirmed or user-selected hat for the next life.
            hat.pending=false;
            stopBedMovement();
            releaseBedInput();
            bed.handoffMove=false;bed.moveKeys.clear();
            bed.pending=false;
            // Inventory from the dead player is invalid in a new life.
            // A fresh packet between death and respawn may re-unlock it.
            bed.preSpawnUnlockAt=0;bed.unlocked=false;
            clearMacros(false);
            resetPlacementTracking();
            cancelHeal(false);
            resetHealTelemetry();
            resetLagGuard();
            resetKatanaGuard();
            resetCombatState();
            player.alive = false;
            player.health = 0;
            startAutoRespawn();
            resetUpgrades(false); // Keep the completed run available to save until respawn.
            updateHealth();
        } else if (id === 14 && Array.isArray(packet[1])) {
            receiveOffer(packet[1]);
        } else if (id === 34) { // server clears the upgrade bar
            clearUpgradeBar();
        } else if (id === 8) { // XP / age update
            noteUpgradeAge(packet);
        } else if (id === 2) { // inventory / available building items
            noteBedInventory(packet);
        } else if (id === 20 && packet instanceof Uint8Array) { // entity snapshots
            // Sample enemy equipment before processing own health: the same
            // snapshot can then trigger a faster survival heal.
            observeKatanaThreat(packet);
            for (let i = 1; i + 18 < packet.length; i += 19) {
                const localId = packet[i + 2] | (packet[i + 3] << 8);
                if (packet[i]!==0 || localId !== player.id) continue;
                if ((packet[i + 8] & 2) !== 0) continue;
                // Incoming angle uses one byte; 65535 / 255 = 257, so both
                // outgoing bytes are equal. Do not overwrite more precise native aim.
                session.serverAim = [packet[i + 9], packet[i + 9]];
                observeWeapon(packet[i + 10]);
                observeSelfHat(packet[i + 11]);
                observeAgeRecoveryHat(packet[i + 11]);
                if (ap.manualItem && performance.now()>=ap.manualUntil &&
                    [0,1,3,4,13,15,17,28,30,31,...session.weaponIds].includes(packet[i+10]) &&
                    heal.phase==='idle' && !macro.selected && performance.now()-session.lastAutomationAt>160) {
                    ap.manualItem=false;
                }
                // Prioritize healing over costly placement/entity bookkeeping.
                // This matters when the client receives a large snapshot just
                // after a server tick stalled for hundreds of milliseconds.
                const now=performance.now();
                noteServerSnapshot(now);
                heal.observedItem=packet[i+10];heal.observedItemAt=now;
                session.self={x:packet[i+4]|packet[i+5]<<8,
                    y:packet[i+6]|packet[i+7]<<8,sid:packet[i+1],team:packet[i+12],at:now};
                const observedHealth=Math.max(0,Math.min(100,
                    packet[i + 13] * 100 / 255));
                if(observedHealth<player.health-1.5 &&
                   ['moving','ready','arrived'].includes(deathReturn.phase))
                    deathReturn.lastHitAt=now;
                recordReturnPosition({x:packet[i+4]|packet[i+5]<<8,
                                      y:packet[i+6]|packet[i+7]<<8},now);
                noteHealthSnapshot(observedHealth,now);
                updateHealth();
                evaluate();
                ownSnapshotProcessed=true;
                break;
            }
            if (player.alive) {
                // Confirming a bed and releasing movement takes precedence
                // over more expensive general placement bookkeeping.
                observeSpawnBed(packet);
                observeReturnObjects(packet);
                observeSmartBed(packet);
                observePlacement(packet);
                observeTargetProximity(packet);
            }
        }
        // The one-off post-death food has priority over normal healing and
        // starts from server updates, including hidden tabs.
        tryAgeRecovery();
        // Entity packets without our player may still wake an ongoing heal.
        if (!ownSnapshotProcessed) evaluate();
        if(autoRespawn.armed)tryAutoRespawn();
        autoPick();
        // Drive bounded upgrade retries from server packets too; timers may be
        // delayed in a hidden/background tab.
        retryUpgradeChoice();
        // React to respawn and newly unlocked beds using fresh server events,
        // without arbitrary timers that get throttled in hidden tabs.
        if (player.alive) { tryRestoreHat(); trySpawnBed(); driveReturn(); }
        if(menu && !menu.hidden && id===20 &&
            performance.now()-lastMenuSnapshotPaint>=180){
            lastMenuSnapshotPaint=performance.now();
            refreshInputs();
        }
        if (id===20 && packet instanceof Uint8Array && player.alive && autoPlacementEnabled()) {
            const now=performance.now();
            if (observeAutoPlace(packet,now)) runAutoPlace(now);
        }
        if(player.alive)driveSpin();
    }
    const retiredGameSockets=new WeakSet();
    const observedGameSockets=new WeakSet();
    function clearGameConnection() {
        resetSmartLife(true);
        goofy.pending=false;
        if(goofy.applied!==null)restoreGoofyNickname(!settings.goofyNames);
        resetTargetNotice();
        clearAgeRecovery('Sem morte nesta conexão');
        stopAutoRespawn();
        // Never use a death target/path from a previous server.
        resetReturnForServer();
        // Do not send an old-server movement STOP to a new server.
        stopBedMovement(false);releaseBedInput();
        player.alive=false;player.id=-1;player.health=100;
        resetSpawnBed();bed.pending=false;bed.unlocked=false;
        bed.preSpawnUnlockAt=0;bed.origin=null;bed.self=null;bed.nearby.clear();
        clearMacros(false);resetPlacementTracking();cancelHeal(false);
        resetHealTelemetry();resetLagGuard();resetKatanaGuard();resetCombatState();
        hat.pending=false;resetUpgrades(true);updateHealth();
    }
    function bindGameSocket(ws) {
        if(session.ws===ws)return;
        if(session.ws)retiredGameSockets.add(session.ws);
        clearGameConnection();
        session.ws=ws;session.connectionEpoch++;
        resetReturnForServer();
        if(!observedGameSockets.has(ws)) {
            observedGameSockets.add(ws);
            ws.addEventListener('message',onGameMessage);
            ws.addEventListener('close',()=>{
                if(session.ws!==ws)return;
                clearGameConnection();session.ws=null;session.connectionEpoch++;
            });
        }
    }
    WebSocket.prototype.send = function(data) {
        const raw = readPacket(data);
        if (raw && raw.length && this!==session.ws &&
            !retiredGameSockets.has(this) && this.readyState===1 &&
            typeof this.url==='string' && /sploop\.io/i.test(this.url)) {
            // On server hops the new socket can send before the old one closes.
            bindGameSocket(this);
        }
        if (this === session.ws && raw && raw.length) {
            // Native movement temporarily owns the controls. Unlike before,
            // it never disables the death-position anchor for the current life.
            if(settings.returnAfterBed && deathReturn.target &&
                ['moving','ready','arrived'].includes(deathReturn.phase)){
                if(raw[0]===1 || raw[0]===6){
                    deathReturn.manualMove=true;
                    if(deathReturn.moveOwned){
                        stopReturnMovement();deathReturn.phase='ready';
                        deathReturn.route=[];deathReturn.step=0;
                    }
                    deathReturn.status='Movimento manual; retomará ao soltar';
                } else if(raw[0]===15){
                    deathReturn.manualMove=false;
                    deathReturn.nextAt=performance.now()+25;
                }
            }
            // While the spawn-bed task owns movement, suppress native movement
            // commands (1, 6, 15). Script-generated movement goes through
            // originalSend in transmit(), and is unaffected.
            if (bed.locked && (raw[0]===1 || raw[0]===6 || raw[0]===15))
                return;
            if (bed.handoffMove && (raw[0]===1 || raw[0]===6 || raw[0]===15))
                bed.handoffMove=false; // Native client has resumed control.
            switch (raw[0]) {
                case 1:
                case 6: // Sploop keyboard movement may also use a direction bitmask.
                case 15:
                    bed.lastManualMoveAt=performance.now();
                    if (bed.pending && (bed.phase==='moving' || bed.phase==='placing'))
                        abortSpawnBed('Native movement');
                    break;
                case 0:
                case 2: {
                    if (raw.length < 2) break;
                    heal.restore=null; // respect an intentional manual item selection
                    ap.manualItem=raw[0]===0?raw[1]>1:!([15,...session.weaponIds].includes(raw[1]));
                    ap.manualUntil=performance.now()+(ap.manualItem?160:0);
                    if (macro.selected) {
                        releaseMacroSelection(false);
                        clearMacros(); // manual item selection takes precedence
                    }
                    if (raw[0] === 0 && (raw[1] === 0 || raw[1] === 1)) rememberSlot(raw[1]);
                    else if (raw[0] === 2) rememberDirectWeapon(raw[1]);
                    // A native item selection replaces held food; do not fire
                    // a delayed heal using the newly selected item.
                    if (heal.foodSelected) {
                        cancelHeal(false);
                        heal.nextAt = performance.now() + 25;
                        wakeAt(heal.nextAt);
                    }
                    break;
                }
                case 13:
                case 19:
                    if (raw.length >= 3) {
                        session.nativeAim = [raw[1], raw[2]];
                    }
                    if (raw[0] === 19) session.attacking = true;
                    if(raw.length===3 && spinCanAim(performance.now())){
                        // Native aim updates otherwise snap rotation back to
                        // the mouse. Only redirect a real, user-issued attack.
                        if(raw[0]===13){driveSpin();return;}
                        const aim=advanceSpin(performance.now());
                        const result=originalSend.call(this,new Uint8Array([19,...aim]));
                        spin.lastSentAt=performance.now();
                        return result;
                    }
                    break;
                case 18: session.attacking = false; break;
            }
        }
        const result = originalSend.apply(this, arguments);
        // Record a native choice only after the original send succeeds.
        if (this === session.ws && raw && raw.length === 2) {
            if (raw[0] === 14) { clearUpgradeRetry(); recordChoice(raw[1]); }
            if (raw[0] === 5 && player.alive) { rememberHat(raw[1]);hat.lastManualAt=performance.now(); }
        }
        return result;
    };

    // NEXUS visual shell: old storage keys and functional bindings are retained.
    let menu = null;
    let healthText = null, healthState = null;
    function updateHealth() {
        if (healthText) healthText.textContent = player.alive ? `${Math.round(player.health)}%` : '—';
        if (healthState) {
            healthState.textContent = player.alive ? 'IN GAME' : 'STANDBY';
            healthState.classList.toggle('is-live', player.alive);
        }
    }
    function editSetting(key, value, external=false) {
        if (!Object.hasOwn(DEFAULTS,key)) return;
        settings[key] = typeof DEFAULTS[key] === 'boolean' ? Boolean(value) : numericSetting(key,value);
        // Legit Heal runs on an independent fixed 1-ms schedule; the stored
        // normal Heal ms is not modified when switching modes.
        if (key==='autoPlaceMs') { settings[key]=Math.max(1,settings[key]); ap.nextAt=0; }
        if (key==='autoPlaceRate') { settings[key]=apRateLimit(settings[key]); ap.nextAt=0; }
        normalizeHolds();
        if (!external) {
            persist(key);
            if (key === 'holdMinMs') persist('holdMaxMs');
        }
        if (!settings.autoHeal) cancelHeal();
        else if (key === 'legitHeal') {
            if(heal.phase!=='idle')cancelHeal();
            const now=performance.now();
            heal.nextAt=Math.max(now,heal.lastSentAt+smartHealInterval());
            clearWake();
        }
        else if (key === 'intervalMs' && !settings.legitHeal) {
            if (heal.phase === 'idle') {
                const now=performance.now();
                // Recalculate in both directions. The old code only allowed
                // faster intervals, leaving stale timers after an increase.
                heal.nextAt=Math.max(now,heal.lastSentAt+smartHealInterval());
                clearWake();
            }
        }
        evaluate();
        if (key === 'autoPick') {
            if (settings.autoPick) hideTargetNotice();
            if (!settings.autoPick) clearUpgradeRetry();
            else autoPick();
        }
        if (key === 'spikeMacro' && !settings.spikeMacro) macro.held.KeyV=false;
        if (key === 'trapMacro' && !settings.trapMacro) macro.held.KeyF=false;
        if (key==='legitMacro') clearMacros();
        if (key==='autoPlace'||key==='autoReplace') {
            if (!autoPlacementEnabled()) { const item=ap.manualItem, until=ap.manualUntil; resetAutoPlace(); ap.manualItem=item; ap.manualUntil=until; }
            else { if (!settings.autoReplace) ap.replaceQueue.clear(); ap.nextAt=0; if (ap.self) scheduleAutoPlace(1); }
        }
        if (key === 'spikeMacro' || key === 'trapMacro' || key === 'spikeMs' || key === 'trapMs') {
            if (macro.selected && !macroActive(macro.selected)) releaseMacroSelection();
            if (Object.keys(macroDefs).some(macroActive)) runMacros(); else stopMacroTimer();
        }
        if (key==='notifyTargets' && !settings.notifyTargets) hideTargetNotice();
        if (key==='showStats') syncStatsVisibility();
        if (key==='lagGuard' && autoPlacementEnabled()) scheduleAutoPlace(1);
        if (key==='threeHitGuard' && !settings.threeHitGuard) resetKatanaGuard();
        if (key==='ageRecovery') {
            if(!settings.ageRecovery)clearAgeRecovery('Recuperação desativada');
            // Enabling mid-life is not permission to replay a past death.
        }
        if (key==='autoLastHat') {
            if (!settings.autoLastHat) hat.pending=false;
            else if (player.alive && hat.wanted && hat.current!==hat.wanted) {
                hat.pending=true;hat.tries=0;hat.nextAt=0;tryRestoreHat();
            }
        }
        if (key==='autoSpawnBed') {
            if (!settings.autoSpawnBed) {
                abortSpawnBed('Feature disabled');
                if(['moving','ready','arrived'].includes(deathReturn.phase))
                    cancelReturn('Ative Cama no Respawn');
            }
            // Enabling mid-life doesn't construct unexpectedly: next spawn arms it.
        }
        if(key==='autoRespawn') {
            if(!settings.autoRespawn)stopAutoRespawn();
            else if(!player.alive && connected())startAutoRespawn();
        }
        if(key==='goofyNames')syncGoofyNickname();
        if(key==='returnSpin'){
            resetSpin();
            if(!settings.returnSpin && player.alive && connected() &&
                !session.attacking && heal.phase==='idle' && !macro.selected &&
                session.nativeAim)transmit([13,...session.nativeAim]);
        }
        // Speed changes preserve the existing phase, avoiding an angle reset.
        if(key==='returnAfterBed') {
            if(!settings.returnAfterBed)cancelReturn('Retorno desativado');
            else if(!settings.autoSpawnBed)deathReturn.status='Ative Cama no Respawn';
            else if(deathReturn.target && player.alive && bed.confirmed &&
                    deathReturn.phase==='cancelled'){
                deathReturn.phase='waiting';
                beginReturnIfReady();driveReturn();
            }
        }
        refreshInputs();
    }
    function toggleTabSync(key) {
        if (!Object.hasOwn(DEFAULTS,key)) return;
        if (isTabIndependent(key)) {
            // Re-link: adopt the shared value; never overwrite other tabs just
            // because this tab chose to re-enable synchronization.
            delete tabOverrides[key];
            saveTabOverrides();
            editSetting(key, readSharedSetting(key), true);
        } else {
            // Unlink: preserve precisely the current value for this tab.
            tabOverrides[key]=settings[key];
            saveTabOverrides();
        }
        refreshInputs();
    }
    function mountTabSyncButtons() {
        for (const input of menu.querySelectorAll('[data-heal-setting]')) {
            const key=input.dataset.healSetting;
            const label=input.closest('label');
            if (!label || !Object.hasOwn(DEFAULTS,key) || label.closest('.nx-setting-row')) continue;
            const row=document.createElement('div');
            row.className='nx-setting-row';
            label.parentNode.insertBefore(row,label);
            row.appendChild(label);
            const button=document.createElement('button');
            button.type='button';
            button.className='nx-setting-sync';
            button.dataset.syncSetting=key;
            button.setAttribute('aria-label',`Sincronizar ${label.textContent.trim()} entre abas`);
            row.appendChild(button);
        }
    }
    function refreshTabSyncButtons() {
        if (!menu) return;
        for (const button of menu.querySelectorAll('[data-sync-setting]')) {
            const independent=isTabIndependent(button.dataset.syncSetting);
            button.textContent=independent ? '⊘' : '↔';
            button.classList.toggle('is-independent',independent);
            button.setAttribute('aria-pressed',String(!independent));
            button.title=independent ?
                'Independente nesta aba. Clique para sincronizar com as outras abas.' :
                'Sincronizado entre abas. Clique para usar apenas nesta aba.';
        }
    }
    function refreshInputs() {
        if (!menu) return;
        const ageStatus=menu.querySelector('#nx-age-recovery-status');
        if(ageStatus)ageStatus.textContent='Age: '+(settings.ageRecovery ? ageRecovery.status : 'desativado');
        const bedStatus=menu.querySelector('#nx-bed-status');
        if(bedStatus) {
            const state=!settings.autoSpawnBed ? 'Cama: desativada' :
                bed.confirmed ? (bed.lastLearned ? 'Cama: posição confirmada' : 'Cama: colocada fora do centro (não aprendida)') :
                !bed.pending ? `Cama: ${bed.abortReason||'aguardando respawn'}` :
                !bed.unlocked ? 'Cama: aguardando item no inventário' :
                !bed.origin ? 'Cama: aguardando posição do spawn' :
                bed.phase==='retry' ? `Cama: ${bed.retryReason} • tentativa ${bed.retryCount+1} • ${Math.ceil(Math.max(0,bed.nextAt-performance.now())/1000)}s` :
                bed.phase==='await-heal' ? 'Cama: aguardando fim da cura (tentativa mantida)' :
                bed.phase==='moving' ? (bed.usedLearned ?
                    'Cama: rota aprendida (WASD bloqueado)' :
                    'Cama: desviando de rotas falhas (WASD bloqueado)') :
                bed.phase==='placing' ? (bed.locked ? 'Cama: colocando (WASD bloqueado)' :
                    'Cama: aguardando confirmação (WASD livre)') :
                bed.usedLearned ? 'Cama: repetindo rota que já funcionou' :
                bed.noRoute ? 'Cama: procurando passagem alternativa' :
                'Cama: calculando rota';
            const memory=bed.origin ? bedKnowledgeFor(bed.layoutKey||bedLayoutSignature()) : null;
            const memoryInfo=memory ? ` • OK ${memory.ok||0} • Rotas bloqueadas ${memory.blocks?.length||0} • Posições rejeitadas ${memory.badGoals?.length||0}` : '';
            bedStatus.textContent=state+memoryInfo+(bed.pending ? ` • Paredes ${bedObstacles().filter(o=>o.type===8||o.type===22).length} • Bloqueios locais ${bed.localBlocked.length}` : '');
        }
        const returnStatus=menu.querySelector('#nx-return-status');
        if(returnStatus)returnStatus.textContent=!settings.returnAfterBed?'Retorno: desativado' :
            !settings.autoSpawnBed?'Retorno: ative Cama no Respawn' :
            !deathReturn.target?'Retorno: aguardando uma morte' :
            deathReturn.status + ` • Raio ${RETURN_DEATH_RADIUS}u` + (['moving','ready','arrived'].includes(deathReturn.phase) ?
                ` • ${Math.round(returnDist(deathReturn.self||bed.origin||deathReturn.target,deathReturn.target))} unidades • falhas ${deathReturn.fails}` : '') +
            (deathReturn.frontObstacle && deathReturn.phase!=='arrived' ?
                ` • Frente: ${returnObstacleLabel(deathReturn.frontObstacle.type)}` : '')+
            (['moving','ready'].includes(deathReturn.phase) ?
                ` • Trechos bloqueados ${deathReturn.bad.filter(f=>
                    performance.now()-f.at<RETURN_BLOCK_TTL).length}` : '');
        for (const input of menu.querySelectorAll('[data-heal-setting]')) {
            const k = input.dataset.healSetting;
            if (input.type === 'checkbox') input.checked = settings[k];
            else if (document.activeElement !== input) input.value = settings[k];
        }
        refreshTabSyncButtons();
    }
    let statsHud=null, statsFrame=null, frames=0, fpsStart=0, lastStatsPaint=0, fps=0;
    function paintStats() {
        if (!statsHud) return;
        const active = autoPlacementEnabled();
        const now=performance.now();
        const values = {
            fps: fps || '—',
            cps: macroCps(now),
            tries: macroAttemptCps(now),
            hcps: heal.sentTimes.filter(at=>now-at<1000).length,
            ap: active ? apCps(now) : '—',
            ok: active ? ap.confirmed.filter(at=>now-at<1000).length : '—',
            rep: settings.autoReplace ? ap.replaced.filter(at=>now-at<1000).length : '—',
        };
        const net=statsHud.querySelector('[data-nx-net]');
        if (net) {
            const state=networkState(now);
            const gap=lag.lastSnapshotAt?Math.round(lag.lastGapMs):0;
            const label=state==='OK' ? `OK · RX ${gap}ms` :
                state==='WAIT' ? 'WAITING' :
                state==='STALL' ? `STALL · ${Math.round(now-lag.lastSnapshotAt)}ms` :
                state==='QUEUE' ? `QUEUE · ${session.ws?.bufferedAmount || 0}B` :
                `RECOVERING · ${Math.round(lag.largestGapMs)}ms`;
            if (net.textContent!==label) net.textContent=label;
        }
        for (const [name, value] of Object.entries(values)) {
            const field=statsHud.querySelector(`[data-nx-stat="${name}"]`);
            if (field && field.textContent!==String(value)) field.textContent=String(value);
        }
        const status=statsHud.querySelector('[data-nx-status]');
        if (status) status.textContent=active ? ap.status : 'AUTO PLACE DESATIVADO';
        const returnField=statsHud.querySelector('[data-nx-return]');
        if(returnField){
            const distance=deathReturn.target && deathReturn.self ?
                Math.round(returnDist(deathReturn.self,deathReturn.target)) : null;
            const detail=settings.returnAfterBed ?
                `${deathReturn.status}${distance===null?'':` · ${distance}u`}` : 'DESATIVADO';
            if(returnField.textContent!==detail)returnField.textContent=detail;
        }
        const guard=statsHud.querySelector('[data-nx-guard]');
        if (guard) guard.textContent=!settings.threeHitGuard ? 'OFF' :
            katanaNearby(now) ? `KATANA #${katanaGuard.weapon} · RISCO` :
            emergencyGuard(now) ? 'CURANDO · EMERGÊNCIA' : 'MONITORANDO';
    }
    function renderStats(t) {
        statsFrame=null;
        if (!settings.showStats || document.hidden || !statsHud) return;
        if (!fpsStart) fpsStart=t;
        frames++;
        if (t-fpsStart>=1000) {
            fps=Math.round(frames*1000/(t-fpsStart)); frames=0; fpsStart=t;
        }
        if (t-lastStatsPaint>=200) { paintStats(); lastStatsPaint=t; }
        statsFrame=requestAnimationFrame(renderStats);
    }
    function syncStatsVisibility() {
        if (!statsHud) return;
        statsHud.hidden=!settings.showStats;
        if (statsFrame!==null) cancelAnimationFrame(statsFrame);
        statsFrame=null; frames=0; fpsStart=0; fps=0; lastStatsPaint=0;
        if (settings.showStats && !document.hidden) {
            paintStats();
            statsFrame=requestAnimationFrame(renderStats);
        }
    }
    function mount() {
        if (!document.body || document.getElementById('gpt-heal-only-menu')) return;
        const style = document.createElement('style');
        style.textContent = `
            /* NEXUS / Sploop Control — graphite + cyan */
            #gpt-heal-only-menu,#gpt-heal-launcher,#gpt-mini-stats{font-family:Inter,'Segoe UI',Arial,sans-serif;box-sizing:border-box}
            #gpt-heal-only-menu *,#gpt-mini-stats *{box-sizing:border-box}
            #gpt-heal-only-menu{
              --nx-cyan:#61eee0;--nx-ink:#e6f7fa;--nx-muted:#92a4b5;--nx-line:rgba(130,169,190,.17);
              position:fixed;right:18px;bottom:80px;width:320px;max-width:calc(100vw - 24px);
              max-height:calc(100vh - 28px);z-index:2147483646;overflow:hidden;
              display:flex;flex-direction:column;color:var(--nx-ink);
              background:linear-gradient(153deg,rgba(21,32,47,.98),rgba(10,16,27,.98) 70%);
              border:1px solid rgba(107,186,193,.32);border-radius:18px;
              box-shadow:0 20px 55px rgba(0,0,0,.64),0 0 28px rgba(42,200,210,.06),inset 0 1px 0 rgba(255,255,255,.06);
              font-size:12px;line-height:1.45;isolation:isolate;
            }
            #gpt-heal-only-menu::before{content:'';position:absolute;inset:0 0 auto;height:2px;
              background:linear-gradient(90deg,transparent,#4be4d8 24%,#97e6ff 65%,transparent);pointer-events:none;z-index:2}
            #gpt-heal-only-menu[hidden],#gpt-mini-stats[hidden]{display:none!important}
            #gpt-heal-launcher{
              position:fixed;bottom:17px;right:18px;z-index:2147483646;width:50px;height:50px;
              border:1px solid rgba(94,231,221,.7);border-radius:15px;cursor:pointer;
              color:#b8fff9;background:linear-gradient(145deg,#182b37,#0a111e 85%);
              box-shadow:0 9px 28px #0009,0 0 18px #46e2d620;font:bold 23px/1 'Segoe UI',Arial;
              transition:transform .16s,border-color .16s,box-shadow .16s;
            }
            #gpt-heal-launcher:hover{transform:translateY(-2px);border-color:#9afff5;box-shadow:0 10px 32px #000a,0 0 24px #46e2d650}
            #gpt-heal-launcher:focus-visible,#gpt-heal-only-menu button:focus-visible,#gpt-heal-only-menu input:focus-visible,
            #gpt-heal-only-menu select:focus-visible{outline:2px solid #61eee0;outline-offset:2px}
            #gpt-heal-only-menu .head{
              background:radial-gradient(circle at 16% 0%,rgba(76,224,221,.10),transparent 60%),rgba(8,18,30,.5);
              padding:16px 17px 15px;display:flex;align-items:center;justify-content:space-between;gap:12px;
              border-bottom:1px solid var(--nx-line);cursor:move;touch-action:none;user-select:none;
            }
            #gpt-heal-only-menu .brand{display:flex;align-items:center;gap:11px;min-width:0}
            #gpt-heal-only-menu .brand-mark{display:grid;place-items:center;flex:0 0 37px;width:37px;height:37px;
              border-radius:11px;border:1px solid rgba(97,238,224,.39);background:rgba(69,225,216,.09);
              box-shadow:inset 0 1px 0 #ffffff10;color:#81fff2;font-size:22px;font-weight:900;letter-spacing:-2px}
            #gpt-heal-only-menu .brand-title{display:block;font-size:16px;font-weight:850;letter-spacing:2.4px;color:#f0ffff;line-height:1.15}
            #gpt-heal-only-menu .brand-sub{display:block;font-size:9px;letter-spacing:1.4px;font-weight:700;color:var(--nx-muted);margin-top:4px}
            #gpt-heal-only-menu .head-actions{display:flex;align-items:center;gap:8px}
            #gpt-heal-only-menu .live-pill{font-size:9px;font-weight:850;letter-spacing:.8px;padding:5px 7px;border-radius:99px;
              color:#8c9cae;border:1px solid #435164;background:#1d2633}
            #gpt-heal-only-menu .live-pill.is-live{color:#82f5df;border-color:#48d8c17a;background:#133a39}
            #gpt-heal-only-menu button.close{width:24px;height:26px;border:0;background:transparent;color:#8297a8;
              font-size:22px;line-height:1;cursor:pointer;border-radius:7px}
            #gpt-heal-only-menu button.close:hover{color:white;background:#ffffff15}
            #gpt-heal-only-menu .tabbar{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;padding:9px 12px;
              border-bottom:1px solid var(--nx-line);background:#0f1a2b75}
            #gpt-heal-only-menu .tabbar button{min-width:0;border:1px solid transparent;background:transparent;color:#849aad;
              cursor:pointer;border-radius:8px;padding:9px 3px;font-size:11px;font-weight:800;letter-spacing:.1px;
              transition:color .15s,background .15s,border-color .15s}
            #gpt-heal-only-menu .tabbar button:hover{color:#dbf9fb;background:#ffffff0b}
            #gpt-heal-only-menu .tabbar button[aria-selected=true]{color:#92fff4;background:rgba(83,221,217,.13);
              border-color:rgba(97,238,224,.26);box-shadow:inset 0 -2px 0 #55e3d7}
            #gpt-heal-only-menu .content{padding:12px 15px 14px;overflow:auto;min-height:0;scrollbar-width:thin;
              scrollbar-color:#39606e #101927}
            #gpt-heal-only-menu .content[hidden]{display:none!important}
            #gpt-heal-only-menu .section-intro{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;
              padding:2px 0 11px;margin-bottom:4px;border-bottom:1px solid var(--nx-line)}
            #gpt-heal-only-menu .nx-group-title{font-size:10px;font-weight:850;color:#90aab9;
              letter-spacing:.7px;text-transform:uppercase;margin-top:14px;padding:0 0 6px;
              border-bottom:1px solid var(--nx-line)}
            #gpt-heal-only-menu .section-intro strong{display:block;font-size:12px;font-weight:850;letter-spacing:.5px;color:#f0fdff}
            #gpt-heal-only-menu .section-intro small{font-size:10px;color:#778fa3;line-height:1.5}
            #gpt-heal-only-menu .health-chip{display:flex;align-items:center;gap:5px;background:#112a30;border:1px solid #4ad5c43a;
              border-radius:8px;padding:4px 8px;color:#90ffed;font-size:12px;font-weight:850;font-variant-numeric:tabular-nums}
            #gpt-heal-only-menu .health-chip::before{content:'♥';font-size:12px}
            #gpt-heal-only-menu label{display:flex;align-items:center;justify-content:space-between;gap:12px;
              min-height:42px;padding:5px 0;border-bottom:1px solid rgba(147,178,192,.09);cursor:default;
              color:#c7d7e4;font-weight:600}
            #gpt-heal-only-menu label:last-child{border-bottom:0}
            #gpt-heal-only-menu .nx-setting-row{display:flex;align-items:center;gap:8px;
              min-height:42px;border-bottom:1px solid rgba(147,178,192,.09)}
            #gpt-heal-only-menu .nx-setting-row:last-child{border-bottom:0}
            #gpt-heal-only-menu .nx-setting-row>label{flex:1;min-width:0;border-bottom:0;
              gap:8px;padding:5px 0;overflow-wrap:anywhere}
            #gpt-heal-only-menu .nx-setting-row input[type=number]{width:70px;flex:0 0 70px}
            #gpt-heal-only-menu .nx-setting-sync{flex:0 0 27px;width:27px;height:27px;
              display:grid;place-items:center;border:1px solid rgba(97,238,224,.43);
              border-radius:8px;background:rgba(61,180,175,.13);color:#a9fff6;
              font:bold 17px/1 'Segoe UI',Arial,sans-serif;cursor:pointer;transition:background .12s,border-color .12s}
            #gpt-heal-only-menu .nx-setting-sync:hover{background:rgba(75,224,212,.24)}
            #gpt-heal-only-menu .nx-setting-sync.is-independent{border-color:#59687a;
              color:#8da0b0;background:#1e2a3b}
            #gpt-heal-only-menu .nx-setting-sync.is-independent:hover{background:#273a4c}
            #gpt-heal-only-menu input[type=number]{width:82px;height:30px;background:#091522;color:#affff4;
              border:1px solid #334b58;border-radius:8px;padding:5px 8px;text-align:right;font-size:12px;font-weight:750;
              font-variant-numeric:tabular-nums}
            #gpt-heal-only-menu input[type=number]:hover{border-color:#63878f}
            #gpt-heal-only-menu input[type=checkbox]{appearance:none;-webkit-appearance:none;position:relative;flex:0 0 35px;
              width:35px;height:20px;margin:0;border-radius:99px;border:1px solid #3e5264;background:#263546;
              cursor:pointer;transition:background .17s,border-color .17s}
            #gpt-heal-only-menu input[type=checkbox]::before{content:'';position:absolute;top:2px;left:2px;width:14px;height:14px;
              border-radius:50%;background:#9caeba;box-shadow:0 1px 4px #0006;transition:transform .17s,background .17s}
            #gpt-heal-only-menu input[type=checkbox]:checked{background:rgba(46,184,177,.44);border-color:#61eee0}
            #gpt-heal-only-menu input[type=checkbox]:checked::before{transform:translateX(15px);background:#aafff5}
            #gpt-heal-only-menu .nx-info-line{font-size:11px;color:#92b8c1;padding:11px 0;line-height:1.5}
            #gpt-heal-only-menu .pick-input{width:100%;display:block;margin:9px 0;padding:10px 11px;
              border:1px solid #334b58;background:#0a1522;color:#e2f5f7;border-radius:9px;font-size:12px}
            #gpt-heal-only-menu .pick-input::placeholder{color:#778ca0}
            #gpt-heal-only-menu .pick-actions{display:flex;gap:8px;margin:10px 0}
            #gpt-heal-only-menu .pick-actions button{flex:1;border:1px solid #426771;background:#183540;color:#a6fff2;
              border-radius:9px;padding:9px;font-size:11px;font-weight:800;cursor:pointer}
            #gpt-heal-only-menu .pick-actions button:hover{background:#22505a}
            #gpt-heal-only-menu .pick-actions button:disabled{opacity:.4;cursor:default}
            #gpt-pick-status{color:#7adcca;font-size:11px;margin:8px 0}
            #gpt-pick-items{white-space:pre-wrap;overflow:auto;max-height:135px;line-height:1.65;
              font:11px/1.65 'Consolas',monospace;color:#b6cfda;margin:5px 0}
            #gpt-heal-only-menu .nx-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;
              border-top:1px solid var(--nx-line);padding:8px 15px;color:#5c788b;font-size:9px;
              font-weight:800;letter-spacing:1.1px;background:rgba(6,13,24,.42)}
            #gpt-heal-only-menu .nx-footer b{color:#7ed7d1;font-weight:800}
            #gpt-mini-stats{position:fixed;top:12px;left:12px;z-index:2147483645;pointer-events:none;
              width:305px;max-width:calc(100vw - 24px);padding:12px 13px 10px;color:#d9f6f8;
              background:linear-gradient(140deg,rgba(16,27,42,.96),rgba(8,16,28,.96));
              border:1px solid rgba(97,238,224,.25);border-radius:13px;
              box-shadow:0 12px 32px #0009,0 0 22px #46e2d610;font-variant-numeric:tabular-nums}
            #gpt-mini-stats::before{content:'';position:absolute;left:13px;right:13px;top:0;height:1px;
              background:linear-gradient(90deg,transparent,#53dacf,transparent)}
            #gpt-mini-stats .nx-stats-head{display:flex;align-items:center;justify-content:space-between;
              font-size:9px;font-weight:850;letter-spacing:1.6px;color:#81f4e7;padding-bottom:9px}
            #gpt-mini-stats .nx-live-dot{display:inline-block;width:5px;height:5px;margin-right:5px;
              border-radius:50%;background:#51e9d7;box-shadow:0 0 9px #50ebd9}
            #gpt-mini-stats .nx-stats-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}
            #gpt-mini-stats .nx-stat{min-width:0;text-align:center;padding:6px 2px;
              border:1px solid rgba(112,147,167,.14);background:#111f30;border-radius:8px}
            #gpt-mini-stats .nx-stat-label{font-size:9px;font-weight:800;letter-spacing:.6px;color:#7896aa}
            #gpt-mini-stats .nx-stat-value{font-size:16px;font-weight:850;color:#edfaff;line-height:1.2;margin-top:4px}
            #gpt-mini-stats .nx-stat:nth-child(2) .nx-stat-value{color:#73f1e4}
            #gpt-mini-stats .nx-stats-footer{display:flex;align-items:center;gap:6px;margin-top:9px;
              border-top:1px solid rgba(112,147,167,.16);padding-top:8px;font-size:9px;letter-spacing:.4px;
              color:#7792a6;overflow:hidden;white-space:nowrap}
            #gpt-mini-stats .nx-stats-footer span{color:#9ac9cf;overflow:hidden;text-overflow:ellipsis}
            @media(max-width:380px){#gpt-heal-only-menu{width:calc(100vw - 24px);right:12px}
              #gpt-mini-stats{left:8px;top:8px;max-width:calc(100vw - 16px)}
              #gpt-heal-only-menu .brand-title{display:block;font-size:14px}}
        `;
        document.head.appendChild(style);
        const launcher = document.createElement('button');
        launcher.id = 'gpt-heal-launcher';
        launcher.type = 'button';
        launcher.textContent = 'N';
        launcher.title = 'NEXUS — abrir / fechar';
        launcher.setAttribute('aria-label', 'Abrir painel NEXUS');
        menu = document.createElement('section');
        menu.id = 'gpt-heal-only-menu';
        menu.hidden = true;
        menu.innerHTML = `
          <div class="head" id="gpt-heal-grip">
            <div class="brand"><span class="brand-mark" aria-hidden="true">N</span><span>
              <span class="brand-title">NEXUS</span><span class="brand-sub">SPLOOP CONTROL</span>
            </span></div>
            <div class="head-actions"><span class="live-pill" id="nx-live-state">STANDBY</span>
              <button type="button" class="close" title="Fechar painel" aria-label="Fechar painel">×</button></div>
          </div>
          <div class="tabbar" role="tablist" aria-label="NEXUS sections">
            <button type="button" data-tab="heal" aria-selected="true">Cura</button>
            <button type="button" data-tab="macros" aria-selected="false">Macros</button>
            <button type="button" data-tab="place" aria-selected="false">Place</button>
            <button type="button" data-tab="respawn" aria-selected="false">Respawn</button>
            <button type="button" data-tab="profiles" aria-selected="false">Perfis</button>
            <button type="button" data-tab="network" aria-selected="false">Rede</button>
            <button type="button" data-tab="hud" aria-selected="false">HUD</button>
            <button type="button" data-tab="fun" aria-selected="false">Fun</button>
          </div>
          <div class="content" data-panel="heal">
            <div class="section-intro"><span><strong>RECOVERY</strong><small>Heal e consumo de comida</small></span>
              <span class="health-chip" id="gpt-heal-health">—</span></div>
            <label title="Use food automatically when your health is below 100%">Auto Heal<input data-heal-setting="autoHeal" type="checkbox"></label>
            <label title="Legit Heal usa agendamento fixo de 1 ms. Hold Min/Max continuam definindo o tempo aleatório segurando comida.">Legit Heal (1 ms)<input data-heal-setting="legitHeal" type="checkbox"></label>
            <label title="Priorize cura após golpes, reconheça Katanas próximas e reduza atraso de Legit Heal somente em emergência. Não garante sobrevivência">3-Hit Guard<input data-heal-setting="threeHitGuard" type="checkbox"></label>
            <label title="Intervalo somente da cura normal (1–1000 ms); Legit Heal sempre usa 1 ms, independente desta opção.">Heal ms (normal)<input data-heal-setting="intervalMs" type="number" min="1" max="1000" step="1"></label>
            <label title="Minimum random time holding food (1–1000 milliseconds)">Hold Min<input data-heal-setting="holdMinMs" type="number" min="1" max="1000" step="1"></label>
            <label title="Maximum random time holding food (1–1000 milliseconds)">Hold Max<input data-heal-setting="holdMaxMs" type="number" min="1" max="1000" step="1"></label>
          </div>
          <div class="content" data-panel="respawn" hidden>
            <div class="section-intro"><span><strong>APÓS RENASCER</strong><small>Equipamento e cama automática</small></span></div>
            <label title="Após morrer nesta mesma aba e conexão, equipa Immunity Gear e tenta consumir uma comida uma única vez, mesmo com Auto Heal desligado. Não ativa ao recarregar, duplicar a aba ou trocar de servidor.">Recuperar Age (Immunity + 1 comida)<input data-heal-setting="ageRecovery" type="checkbox"></label>
            <div class="nx-info-line" id="nx-age-recovery-status">Age: aguardando morte nesta aba</div>
            <label title="Após morrer, clica automaticamente no Play do jogo. Repete após cada morte enquanto ativo.">Auto Spawn<input data-heal-setting="autoRespawn" type="checkbox"></label>
            <label title="Após morrer, tenta reequipar o último chapéu observado. O servidor precisa autorizar a compra/equipamento">Último Chapéu<input data-heal-setting="autoLastHat" type="checkbox"></label>
            <label title="Usa caminhos aprendidos por configuração das estruturas; descarta posições antigas quando troca de servidor.">Cama no Respawn<input data-heal-setting="autoSpawnBed" type="checkbox"></label>
            <label title="Após confirmar a cama, retorna ao ponto original da morte. Mortes dentro do raio de 120 unidades mantêm esse ponto; fora dele criam um novo. Requer Cama no Respawn.">Fixar no Local da Morte<input data-heal-setting="returnAfterBed" type="checkbox"></label>
            <div class="nx-info-line" id="nx-bed-status">Cama: aguardando respawn</div>
            <div class="nx-info-line" id="nx-return-status">Retorno: aguardando morte</div>
            <div class="pick-actions" style="margin-top:8px">
              <button type="button" id="nx-bed-cancel" title="Interrompe apenas a tentativa atual e devolve o controle">Parar cama</button>
              <button type="button" id="nx-bed-reset" title="Apaga apenas a memória de rotas da cama">Limpar rotas</button>
            </div>
            <div class="pick-actions" style="margin-top:6px">
              <button type="button" id="nx-return-stop" title="Desativa a vigilância do ponto de morte e libera o movimento">Desativar retorno</button>
              <button type="button" id="nx-return-clear" title="Apaga rotas de retorno aprendidas e mantém a opção">Limpar retornos</button>
            </div>
          </div>
          <div class="content" data-panel="fun" hidden>
            <div class="section-intro"><span><strong>FUN</strong><small>Rotação e nomes engraçados</small></span></div>
            <label title="Giro contínuo e fluido com qualquer item na mão, mesmo sem retorno ou cama. Não inicia ataques; pausa apenas durante ações automáticas incompatíveis.">Giro 360°<input data-heal-setting="returnSpin" type="checkbox"></label>
            <label title="Velocidade angular em graus por segundo, sem máximo configurado. 360 = uma volta por segundo.">Velocidade 360°/s<input data-heal-setting="spinDegreesPerSecond" type="number" min="0" step="any"></label>
            <div class="nx-info-line">360 = 1 volta/s • 720 = 2 voltas/s</div>
            <label title="Troca o apelido a cada respawn após uma morte. Guarda o nome original nesta aba e restaura ao desligar. Funciona também com Play manual.">Goofy Names<input data-heal-setting="goofyNames" type="checkbox"></label>
            <label title="Com Goofy Names ligado, escolhe nomes com base na duração da vida, mortes seguidas, lag recente, cama destruída ou espinhos próximos. Desligado = nomes aleatórios.">Smart Names<input data-heal-setting="smartNames" type="checkbox"></label>
            <div class="nx-info-line">Memória dos últimos 100 nomes nesta aba</div>
          </div>
          <div class="content" data-panel="macros" hidden>
            <div class="section-intro"><span><strong>MANUAL MACROS</strong><small>F / V · controles e velocidade</small></span></div>
            <label title="Keep the building selected and retry while F/V is held; release on detected placement">Legit Macro<input data-heal-setting="legitMacro" type="checkbox"></label>
            <label title="Hold V to place spikes in the native aim direction">Spike (V)<input data-heal-setting="spikeMacro" type="checkbox"></label>
            <label title="Requested delay, not guaranteed server speed (1–1000 ms)">Spike ms<input data-heal-setting="spikeMs" type="number" min="1" max="1000" step="1"></label>
            <label title="Hold F to place traps in the native aim direction">Trap (F)<input data-heal-setting="trapMacro" type="checkbox"></label>
            <label title="Requested delay, not guaranteed server speed (1–1000 ms)">Trap ms<input data-heal-setting="trapMs" type="number" min="1" max="1000" step="1"></label>
          </div>
          <div class="content" data-panel="place" hidden>
            <div class="section-intro"><span><strong>SMART PLACEMENT</strong><small>Intercepção e reconstrução</small></span></div>
            <label title="Predict nearby opponent movement and search placement angles">Smart Auto Place<input data-heal-setting="autoPlace" type="checkbox"></label>
            <label title="Rebuild removed own traps; spikes only at approved finisher positions">Auto Replace<input data-heal-setting="autoReplace" type="checkbox"></label>
            <label title="Prioritize trapping free opponents before placing spikes">Auto Trap<input data-heal-setting="autoPlaceTrap" type="checkbox"></label>
            <label title="Only use automatic spikes for low-health, stable trapped opponents with high-confidence estimated contact; no guaranteed kill">Auto Spike<input data-heal-setting="autoPlaceSpike" type="checkbox"></label>
            <label title="Minimum interval between automatic attempts; server updates may be slower">Place ms<input data-heal-setting="autoPlaceMs" type="number" min="1" max="1000" step="1"></label>
            <label title="Local Auto Place packet budget only; higher values may cause lag or rejection">AP packets/s<input data-heal-setting="autoPlaceRate" type="number" min="240" max="480" step="20"></label>
          </div>
          <div class="content" data-panel="network" hidden>
            <div class="section-intro"><span><strong>REDE</strong><small>Lag e estabilidade da conexão</small></span></div>
            <label title="Pause F/V macros e Auto Place durante travamentos e congestionamento do WebSocket, dando prioridade à cura">Lag Guard<input data-heal-setting="lagGuard" type="checkbox"></label>
          </div>
          <div class="content" data-panel="hud" hidden>
            <div class="section-intro"><span><strong>TELEMETRIA</strong><small>FPS, CPS e status do servidor</small></span></div>
            <label title="Mostrar mini HUD com FPS, CPS, Auto Place e eventos de rede">FPS / CPS HUD<input data-heal-setting="showStats" type="checkbox"></label>
            <div class="nx-info-line">↔ sincroniza a opção entre abas · ⊘ mantém o valor só nesta aba. Use o botão ao lado de cada opção.</div>
            <div class="nx-info-line">Configurações do jogo são salvas automaticamente.</div>
          </div>
          <div class="content" data-panel="profiles" hidden>
            <div class="section-intro"><span><strong>UPGRADE PROFILES</strong><small>Salve e reproduza seus upgrades</small></span></div>
            <label title="Automatically repeat the selected profile whenever its next item is offered">Auto Pick<input data-heal-setting="autoPick" type="checkbox"></label>
            <label title="Mostra Yes somente uma vez por vida, se Auto Pick estiver desligado e nenhum upgrade tiver sido escolhido.">Aviso de alvos<input data-heal-setting="notifyTargets" type="checkbox"></label>
            <div id="nx-target-debug" class="nx-info-line">Detecção de jogadores: aguardando dados</div>
            <select id="gpt-pick-profile" class="pick-input" aria-label="Saved profile"></select>
            <input id="gpt-pick-name" class="pick-input" maxlength="32" placeholder="Profile name" title="Choose items manually, then enter a name and save. Use the same name to replace a profile.">
            <div class="pick-actions">
              <button type="button" id="gpt-pick-save" title="Save all choices from the current run">Save</button>
              <button type="button" id="gpt-pick-delete" title="Delete the selected profile">Delete</button>
            </div>
            <div id="gpt-pick-status" aria-live="polite"></div>
            <pre id="gpt-pick-items"></pre>
          </div>
          <div class="nx-footer"><span>NEXUS SYSTEMS</span><span><b>v${NEXUS_VERSION}</b> · SPLOOP</span></div>`;
        document.body.appendChild(menu);
        document.body.appendChild(launcher);
        statsHud=document.createElement('div'); statsHud.id='gpt-mini-stats';
        statsHud.title='FPS estimado | CPS: estruturas F/V observadas e associadas à macro (estimativa, não ACK) | TRY/s: tentativas F/V enviadas | H/CPS: tentativas de cura enviadas | AP: Auto Place | OK: estruturas observadas | REP: reposições observadas';
        statsHud.innerHTML=`
          <div class="nx-stats-head"><span>NEXUS v${NEXUS_VERSION} · TELEMETRY</span><span><i class="nx-live-dot"></i>ACTIVE</span></div>
          <div class="nx-stats-grid">
            <div class="nx-stat"><div class="nx-stat-label">FPS</div><div class="nx-stat-value" data-nx-stat="fps">—</div></div>
            <div class="nx-stat"><div class="nx-stat-label">CPS</div><div class="nx-stat-value" data-nx-stat="cps">0</div></div>
            <div class="nx-stat"><div class="nx-stat-label">TRY/s</div><div class="nx-stat-value" data-nx-stat="tries">0</div></div>
            <div class="nx-stat"><div class="nx-stat-label">H/CPS</div><div class="nx-stat-value" data-nx-stat="hcps">0</div></div>
            <div class="nx-stat"><div class="nx-stat-label">AP</div><div class="nx-stat-value" data-nx-stat="ap">—</div></div>
            <div class="nx-stat"><div class="nx-stat-label">OK</div><div class="nx-stat-value" data-nx-stat="ok">—</div></div>
            <div class="nx-stat"><div class="nx-stat-label">REP</div><div class="nx-stat-value" data-nx-stat="rep">—</div></div>
          </div>
          <div class="nx-stats-footer">CPS: colocações observadas · TRY/s: comandos enviados</div>
          <div class="nx-stats-footer">SMART PLACE: <span data-nx-status>—</span></div>
          <div class="nx-stats-footer">SERVER UPDATES: <span data-nx-net>WAITING</span></div>
          <div class="nx-stats-footer">RETURN: <span data-nx-return>AGUARDANDO</span></div>
          <div class="nx-stats-footer">3-HIT GUARD: <span data-nx-guard>MONITORANDO</span></div>`;
        document.body.appendChild(statsHud); syncStatsVisibility();
        healthState = menu.querySelector('#nx-live-state');
        healthText = menu.querySelector('#gpt-heal-health');
        mountTabSyncButtons();
        updateHealth();
        refreshInputs();
        refreshProfiles();
        for (const button of menu.querySelectorAll('[data-tab]')) button.addEventListener('click', () => {
            for (const panel of menu.querySelectorAll('[data-panel]')) panel.hidden = panel.dataset.panel !== button.dataset.tab;
            for (const tab of menu.querySelectorAll('[data-tab]')) tab.setAttribute('aria-selected', String(tab === button));
        });
        menu.querySelector('#nx-bed-cancel').addEventListener('click',()=>{
            if(bed.pending)abortSpawnBed('Parada manual pelo HUD');
            refreshInputs();
        });
        menu.querySelector('#nx-return-stop').addEventListener('click',()=>{
            editSetting('returnAfterBed',false);refreshInputs();
        });
        menu.querySelector('#nx-return-clear').addEventListener('click',()=>{
            returnPaths.length=0;saveReturnPaths();
            deathReturn.recorded=[];
            refreshInputs();
        });
        menu.querySelector('#nx-bed-reset').addEventListener('click',()=>{
            bedRouteKnowledge=[];saveBedKnowledge();
            bed.layoutKey=null;bed.usedLearned=false;
            if(bed.pending){
                stopBedMovement();bed.phase='await-position';
                bed.awaitFreshAt=0;bed.nextAt=0;bed.route=[];
            }
            refreshInputs();
        });
        const profileSelect = menu.querySelector('#gpt-pick-profile');
        const profileName = menu.querySelector('#gpt-pick-name');
        profileSelect.addEventListener('change', () => {
            selectedProfile = profileSelect.value; profileName.value = selectedProfile;
            clearUpgradeRetry();
            profileStatus = ''; saveProfiles(); refreshProfiles(); autoPick();
        });
        menu.querySelector('#gpt-pick-save').addEventListener('click', () => {
            const name = profileName.value.trim() || selectedProfile || `Profile ${profiles.length+1}`;
            if (!upgrades.choices.some(validId)) return;
            const items = upgrades.choices.slice(0,32);
            const existing = profiles.find(p => p.name === name);
            if (existing) existing.items = items;
            else if (profiles.length < 30) profiles.push({name,items});
            else { profileStatus = 'Profile limit reached'; refreshProfiles(); return; }
            selectedProfile = name; profileName.value = name;
            profileStatus = saveProfiles() ? 'Saved' : 'Storage unavailable';
            refreshProfiles(); autoPick();
        });
        menu.querySelector('#gpt-pick-delete').addEventListener('click', () => {
            profiles = profiles.filter(p => p.name !== selectedProfile);
            selectedProfile = ''; profileName.value = ''; profileStatus = saveProfiles() ? 'Deleted' : 'Storage unavailable'; refreshProfiles();
        });
        const toggle = () => {
            menu.hidden = !menu.hidden;
            if (!menu.hidden) {
                // Opening HUD is for observation; it must not cancel navigation.
                clearMacros();
                if (menu.style.left) {
                    menu.style.left=`${Math.max(0,Math.min(innerWidth-menu.offsetWidth,parseFloat(menu.style.left)))}px`;
                    menu.style.top=`${Math.max(0,Math.min(innerHeight-menu.offsetHeight,parseFloat(menu.style.top)))}px`;
                }
            }
            else if (document.activeElement === launcher || menu.contains(document.activeElement)) document.activeElement.blur();
            launcher.setAttribute('aria-expanded', String(!menu.hidden));
        };
        launcher.addEventListener('click', toggle);
        menu.querySelector('.close').addEventListener('click', toggle);
        menu.addEventListener('click', event => {
            const button=event.target.closest('[data-sync-setting]');
            if (!button) return;
            event.preventDefault();
            event.stopPropagation();
            toggleTabSync(button.dataset.syncSetting);
        },true);
        menu.addEventListener('change', event => {
            const input = event.target.closest('[data-heal-setting]');
            if (input) editSetting(input.dataset.healSetting, input.type === 'checkbox' ? input.checked : input.value);
        },true);
        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || event.repeat) return;
            const tag = event.target && event.target.tagName;
            if ((tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') &&
                !menu.contains(event.target)) return;
            toggle();
            event.preventDefault();
        });
        // Drag without leaving the viewport.
        const grip = menu.querySelector('#gpt-heal-grip');
        let start = null;
        grip.addEventListener('pointerdown', event => {
            if (event.target.closest('button')) return;
            const rect = menu.getBoundingClientRect();
            menu.style.left = `${rect.left}px`;
            menu.style.top = `${rect.top}px`;
            menu.style.right = 'auto';
            menu.style.bottom = 'auto';
            start = { id: event.pointerId, mx: event.clientX, my: event.clientY, x: rect.left, y: rect.top };
            grip.setPointerCapture(event.pointerId);
        });
        grip.addEventListener('pointermove', event => {
            if (!start || event.pointerId !== start.id) return;
            const x = start.x + event.clientX - start.mx;
            const y = start.y + event.clientY - start.my;
            menu.style.left = `${Math.max(0, Math.min(window.innerWidth - menu.offsetWidth, x))}px`;
            menu.style.top = `${Math.max(0, Math.min(window.innerHeight - menu.offsetHeight, y))}px`;
        });
        function saveMenuPosition() {
            try { localStorage.setItem(PREFIX+'menu_position',JSON.stringify({x:parseFloat(menu.style.left),y:parseFloat(menu.style.top)})); } catch (_) {}
        }
        const end = () => { start = null; saveMenuPosition(); };
        try {
            const pos=JSON.parse(localStorage.getItem(PREFIX+'menu_position')||'null');
            if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
                menu.style.left=`${Math.max(0,Math.min(innerWidth- Math.min(260,innerWidth-24),pos.x))}px`;
                menu.style.top=`${Math.max(0,Math.min(innerHeight-56,pos.y))}px`;
                menu.style.right='auto'; menu.style.bottom='auto';
            }
        } catch (_) {}
        grip.addEventListener('pointerup', end);
        grip.addEventListener('pointercancel', end);
    }
    function syncSettingsFromStorage() {
        for (const [key, fallback] of Object.entries(DEFAULTS)) {
            // Page visibility, storage events and pageshow must not overwrite
            // an unlinked option with another tab's value.
            if (isTabIndependent(key)) continue;
            const value=readSharedSetting(key,fallback);
            if (settings[key]!==value) editSetting(key,value,true);
        }
        try {
            const raw=localStorage.getItem(profileKey);
            const data=raw?JSON.parse(raw):null;
            if (data && Array.isArray(data.profiles)) {
                profiles=data.profiles.filter(p=>p && typeof p.name==='string' && Array.isArray(p.items))
                    .slice(0,30).map(p=>({name:p.name.trim().slice(0,32),
                        items:p.items.slice(0,32).map(id=>validId(id)?id:null)}))
                    .filter(p=>p.name);
                selectedProfile=profiles.some(p=>p.name===data.selected)?data.selected:'';
                refreshProfiles();
            }
        } catch (_) {}
        refreshInputs();
        evaluate();
        autoPick();
        if (autoPlacementEnabled() && ap.self) scheduleAutoPlace(1);
        syncStatsVisibility();
    }
    window.addEventListener('storage',event=>{
        if (event.storageArea && event.storageArea!==localStorage) return;
        if (event.key===GAME_TOGGLES_KEY) {
            try {
                const incoming=JSON.parse(event.newValue||'{}');
                for (const [id,value] of Object.entries(incoming)) {
                    if (typeof value==='boolean') {
                        if (gameToggles[id]!==value) nativeRestoreGeneration++;
                        gameToggles[id]=value;nativeTouched.delete(id);
                    }
                }
                queueNativeRestore(250);
            } catch (_) {}
            return;
        }
        if (event.key===null || event.key===profileKey ||
            (typeof event.key==='string' && event.key.startsWith(PREFIX))) {
            syncSettingsFromStorage();
        }
    });
    function resumeAutomationsAfterSleep(){
        // Never continue a movement command issued before browser suspension.
        // Fresh authoritative data is required before any next movement.
        const now=performance.now();
        if(deathReturn.moveOwned &&
           (!deathReturn.self || now-deathReturn.self.at>RETURN_SNAPSHOT_TTL)){
            stopReturnMovement();
            deathReturn.phase='ready';
            deathReturn.nextAt=now;
            deathReturn.status='Retomando após suspensão';
        }
        tryAgeRecovery();
        if(autoRespawn.armed)tryAutoRespawn();
        if(bed.pending){
            if(bed.locked && (!bed.self || now-bed.self.at>BED_SNAPSHOT_TTL))
                retrySpawnBed('Retomando após suspensão',now);
            trySpawnBed(now);
        }
        retryUpgradeChoice();
        autoPick();
        evaluate();
        if(deathReturn.self && now-deathReturn.self.at<=RETURN_SNAPSHOT_TTL)driveReturn(now);
        if(autoPlacementEnabled() && ap.self && now-ap.self.at<=AP_PLAYER_TTL)
            runAutoPlace(now);
    }
    window.addEventListener('pageshow',()=>{
        syncSettingsFromStorage();queueNativeRestore(350);
        resumeAutomationsAfterSleep();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            hideTargetNotice();
            clearMacros();backupGameSettings();
        } else {syncSettingsFromStorage();queueNativeRestore(350);}
        // Incoming WebSocket snapshots remain the primary clock. Resume
        // only if the last snapshot is still fresh; never make up positions.
        resumeAutomationsAfterSleep();
        if(!document.hidden)flushTargetNotice();
        syncStatsVisibility();
    });
    // Chromium can freeze hidden pages altogether. Release owned movement
    // before suspension; resume ONLY after new server snapshots arrive.
    document.addEventListener('freeze',()=>{
        if(bed.pending && (bed.moveOwned || bed.locked))
            retrySpawnBed('Aba suspensa; retomada automática');
        if(deathReturn.moveOwned){
            stopReturnMovement();deathReturn.phase='ready';
            deathReturn.nextAt=performance.now();
            deathReturn.status='Navegação pausada pelo navegador';
        }
    });
    document.addEventListener('resume',resumeAutomationsAfterSleep);
    // Independent safety clock; snapshots and the normal worker still drive heals.
    setInterval(()=>{if(player.alive && (heal.foodSelected || heal.restore)){
        if(!recoverStuckHeal())watchHealRestore();
    }},100);
    setInterval(()=>{if(goofy.original!==null || settings.goofyNames)syncGoofyNickname();},500);
    function spinFrame(){
        if(!document.hidden && settings.returnSpin && player.alive)driveSpin();
        requestAnimationFrame(spinFrame);
    }
    requestAnimationFrame(spinFrame);
    // Hidden tabs use snapshots plus a timer; no packet bursts on resume.
    setInterval(()=>{if(document.hidden && settings.returnSpin && player.alive)driveSpin();},SPIN_INTERVAL_MS);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
    else mount();
})();
