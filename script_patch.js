(function(){
  'use strict';

  const GROUP_PREFS_KEY = 'medical-app-group-prefs-v2';

  function normalizeSectionType(sectionType){
    const s = String(sectionType || '').toLowerCase();
    if(s === 'lecture' || s === 'lectures') return 'lectures';
    if(s === 'year' || s === 'years') return 'years';
    if(s === 'ai') return 'ai';
    return s || 'custom';
  }

  function getGroupOrderKey(subjectName, sectionType){
    return `${subjectName || 'unknown'}::${normalizeSectionType(sectionType)}`;
  }

  function shouldEnhanceSelectionScreen(){
    return state.browseMode === 'all';
  }

  if(!state.groupPreferences) state.groupPreferences = {};
  try{
    state.groupPreferences = JSON.parse(localStorage.getItem(GROUP_PREFS_KEY) || '{}') || {};
  }catch(e){
    state.groupPreferences = {};
  }

  if(!state.historyDeleteState) state.historyDeleteState = { baseScope:'all', ids:[] };

  function saveGroupPreferences(){
    try{
      localStorage.setItem(GROUP_PREFS_KEY, JSON.stringify(state.groupPreferences || {}));
    }catch(e){}
  }

  function getOriginalOrderIds(subjectName, sectionType){
    const subject = (state.subjects || []).find(s => s.name === subjectName || s.id === subjectName);
    if(!subject) return [];
    const normalized = normalizeSectionType(sectionType);
    if(normalized === 'lectures') return (subject.lectures || []).map(g => g.id);
    if(normalized === 'years') return (subject.years || []).map(g => g.id);
    if(normalized === 'ai') return (subject.ai || []).map(g => g.id);
    return [];
  }

    function ensureGroupOrder(groups, sectionType, subjectName){
    if(!Array.isArray(groups) || !groups.length) return groups || [];
    const actualSubjectName = subjectName || groups[0]?.subjectName || state.currentSubject?.name || 'unknown';
    const actualSectionType = sectionType || groups[0]?.type || 'lectures';
    const key = getGroupOrderKey(actualSubjectName, actualSectionType);
    const originalIds = getOriginalOrderIds(actualSubjectName, actualSectionType);
    const fallbackIds = originalIds.length ? originalIds : groups.map(g => g.id);
    let stored = Array.isArray(state.groupPreferences[key]) ? state.groupPreferences[key].slice() : fallbackIds.slice();
    const ids = groups.map(g => g.id);
    const clean = stored.filter(id => ids.includes(id));
    ids.forEach(id => { if(!clean.includes(id)) clean.push(id); });
    state.groupPreferences[key] = clean;
    saveGroupPreferences();
    const rank = new Map(clean.map((id,i)=>[id,i]));
    const sorted = groups.slice().sort((a,b)=>(rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
    const frequentGroups = sorted.filter(g => g && g.isFrequentGroup);
    if(frequentGroups.length){
      const regularGroups = sorted.filter(g => !g || !g.isFrequentGroup);
      frequentGroups.sort((a,b)=>((a.fixedPosition ?? 0) - (b.fixedPosition ?? 0)));
      return frequentGroups.concat(regularGroups);
    }
    return sorted;
  }
  window.ensureGroupOrder = ensureGroupOrder;

  function moveGroupToBottomByInfo(subjectName, sectionType, groupId){
    const key = getGroupOrderKey(subjectName, sectionType);
    let arr = Array.isArray(state.groupPreferences[key]) ? state.groupPreferences[key].slice() : getOriginalOrderIds(subjectName, sectionType);
    arr = arr.filter(id => id !== groupId);
    arr.push(groupId);
    state.groupPreferences[key] = arr;
    saveGroupPreferences();
  }

  function reorderGroupIds(subjectName, sectionType, draggedId, targetId, afterTarget){
    const key = getGroupOrderKey(subjectName, sectionType);
    const arr = Array.isArray(state.groupPreferences[key]) ? state.groupPreferences[key].slice() : getOriginalOrderIds(subjectName, sectionType);
    const filtered = arr.filter(id => id !== draggedId);
    const targetIndex = filtered.indexOf(targetId);
    if(targetIndex < 0){
      filtered.push(draggedId);
    }else{
      filtered.splice(targetIndex + (afterTarget ? 1 : 0), 0, draggedId);
    }
    state.groupPreferences[key] = filtered;
    saveGroupPreferences();
  }

  function resetSectionToOriginalOrder(subjectName, sectionType){
    const key = getGroupOrderKey(subjectName, sectionType);
    const originalIds = getOriginalOrderIds(subjectName, sectionType);
    if(!originalIds.length) return;
    state.groupPreferences[key] = originalIds.slice();
    saveGroupPreferences();
  }

  function restoreGroupToOriginalPosition(subjectName, sectionType, groupId){
    const key = getGroupOrderKey(subjectName, sectionType);
    const originalIds = getOriginalOrderIds(subjectName, sectionType);
    if(!originalIds.length) return;
    const originalRank = new Map(originalIds.map((id, idx) => [id, idx]));
    const current = Array.isArray(state.groupPreferences[key]) ? state.groupPreferences[key].slice() : originalIds.slice();
    const filtered = current.filter(id => id !== groupId && originalRank.has(id));
    const groupRank = originalRank.get(groupId);
    if(groupRank == null) return;
    let inserted = false;
    const next = [];
    for(const id of filtered){
      if(!inserted && (originalRank.get(id) ?? 1e9) > groupRank){
        next.push(groupId);
        inserted = true;
      }
      next.push(id);
    }
    if(!inserted) next.push(groupId);
    state.groupPreferences[key] = next;
    saveGroupPreferences();
  }

  function getAllGroupsForSubject(subject){
    if(!subject) return [];
    return []
      .concat((subject.lectures || []).map(g => ({ group:g, sectionType:'lectures', type:'lecture' })))
      .concat((subject.years || []).map(g => ({ group:g, sectionType:'years', type:'year' })))
      .concat((subject.ai || []).map(g => ({ group:g, sectionType:'ai', type:'ai' })));
  }

  function findGroupById(groupId){
    for(const subject of (state.subjects || [])){
      for(const item of getAllGroupsForSubject(subject)){
        if(item.group.id === groupId) return { subject, ...item };
      }
    }
    return null;
  }

    function addProgressIdsForQuestion(q){
    if(!q) return;
    addProgressId('subject:'+q.subjectName, q.id);
    const actual = q.originalSourceType || q.sourceType;
    if(actual === 'lecture' && q.lectureName) addProgressId('lecture:'+q.subjectName+'/'+q.lectureName, q.id);
    if(actual === 'ai' && q.lectureName) addProgressId('ai:'+q.subjectName+'/'+q.lectureName, q.id);
    const batches = Array.isArray(q.batchNames) && q.batchNames.length ? q.batchNames.map(s=>String(s).trim()).filter(Boolean) : (q.batchName ? [q.batchName] : []);
    batches.forEach(batch => addProgressId('year:'+q.subjectName+'/'+batch, q.id));
  }  

  function removeProgressIdsFromKey(key, ids){
    if(!state.progress[key]) return;
    const set = new Set(ids);
    const entry = state.progress[key] || { questionIds: [] };
    entry.questionIds = (entry.questionIds || []).filter(id => !set.has(id));
    if(!entry.questionIds.length) delete state.progress[key];
    else state.progress[key] = entry;
  }

    function removeProgressIdsForQuestion(q){
    if(!q) return;
    const ids = [q.id];
    removeProgressIdsFromKey('subject:'+q.subjectName, ids);
    const actual = q.originalSourceType || q.sourceType;
    if(actual === 'lecture' && q.lectureName) removeProgressIdsFromKey('lecture:'+q.subjectName+'/'+q.lectureName, ids);
    if(actual === 'ai' && q.lectureName) removeProgressIdsFromKey('ai:'+q.subjectName+'/'+q.lectureName, ids);
    const batches = Array.isArray(q.batchNames) && q.batchNames.length ? q.batchNames.map(s=>String(s).trim()).filter(Boolean) : (q.batchName ? [q.batchName] : []);
    batches.forEach(batch => removeProgressIdsFromKey('year:'+q.subjectName+'/'+batch, ids));
  }  

  function rerenderAfterChecklistRelatedChange(){
    try{ syncAutoCompletedLectures(); }catch(e){}
    try{ saveChecklistStore(); }catch(e){}
    try{ saveProgressStore(); }catch(e){}
    try{ saveGroupPreferences(); }catch(e){}
    if(typeof renderChecklist === 'function') renderChecklist();
    if(typeof renderChecklistSubject === 'function' && el('checklist-subject-screen') && el('checklist-subject-screen').classList.contains('active')) renderChecklistSubject();
    if(typeof renderSubjects === 'function') renderSubjects();
    if(typeof renderSelectionScreenWithEnhancements === 'function' && el('selection-screen') && el('selection-screen').classList.contains('active')){
      renderSelectionScreenWithEnhancements();
    }
    if(typeof updateStatisticsIfOpen === 'function') updateStatisticsIfOpen();
    if(typeof renderMemories === 'function') renderMemories();
  }

  function syncAutoCompletedLectures(){
    let changed = false;
    function syncGroup(subject, group, sectionType, progressKey){
      const total = Array.isArray(group.questions) ? group.questions.length : 0;
      const answered = getAnsweredCountForKey(progressKey);
      const completed = total > 0 && answered >= total;
      if(completed){
        if(!state.checklistCompleted[group.id]){
          state.checklistCompleted[group.id] = true;
          changed = true;
        }
        const prefKey = getGroupOrderKey(subject.name, sectionType);
        const before = JSON.stringify(Array.isArray(state.groupPreferences[prefKey]) ? state.groupPreferences[prefKey] : []);
        moveGroupToBottomByInfo(subject.name, sectionType, group.id);
        const after = JSON.stringify(Array.isArray(state.groupPreferences[prefKey]) ? state.groupPreferences[prefKey] : []);
        if(before !== after){
          changed = true;
        }
      } else {
        if(state.checklistCompleted[group.id]){
          delete state.checklistCompleted[group.id];
          changed = true;
        }
      }
    }
    for(const subject of (state.subjects || [])){
      for(const group of (subject.lectures || [])){
        syncGroup(subject, group, 'lectures', `lecture:${subject.name}/${group.name}`);
      }
      for(const group of (subject.ai || [])){
        syncGroup(subject, group, 'ai', `ai:${subject.name}/${group.name}`);
      }
      for(const group of (subject.years || [])){
        syncGroup(subject, group, 'years', `year:${subject.name}/${group.name}`);
      }
    }
    if(changed){
      try{ saveChecklistStore(); }catch(e){}
      try{ saveGroupPreferences(); }catch(e){}
    }
    return changed;
  }

  function setGroupCompleted(groupId, completed, opts){
    const options = Object.assign({ moveBottom:false, countAsAnswered:false, resetProgress:false }, opts || {});
    const found = findGroupById(groupId);
    if(!found) return;
    const { subject, group, sectionType } = found;

    if(completed){
      state.checklistCompleted[group.id] = true;
      if(options.countAsAnswered){
        (group.questions || []).forEach(q => addProgressIdsForQuestion(q));
      }
      if(options.moveBottom){
        moveGroupToBottomByInfo(subject.name, sectionType, group.id);
        if(Array.isArray(state.currentGroups) && state.currentGroups.length){
          state.currentGroups = ensureGroupOrder(state.currentGroups, sectionType, subject.name);
        }
      }
    } else {
      delete state.checklistCompleted[group.id];
      if(options.resetProgress){
        (group.questions || []).forEach(q => removeProgressIdsForQuestion(q));
      }
      restoreGroupToOriginalPosition(subject.name, sectionType, group.id);
      if(Array.isArray(state.currentGroups) && state.currentGroups.length){
        state.currentGroups = ensureGroupOrder(state.currentGroups, sectionType, subject.name);
      }
    }
    saveChecklistStore();
    saveProgressStore();
    saveGroupPreferences();
    rerenderAfterChecklistRelatedChange();
  }

  function markGroupsCompletedBulk(groups){
    groups.forEach(group => {
      state.checklistCompleted[group.id] = true;
      (group.questions || []).forEach(q => addProgressIdsForQuestion(q));
      moveGroupToBottomByInfo(group.subjectName || state.currentSubject?.name || 'unknown', normalizeSectionType(group.type || 'lecture'), group.id);
    });
    saveGroupPreferences();
    rerenderAfterChecklistRelatedChange();
  }

  function resetGroupsCompletionBulk(groups){
    groups.forEach(group => {
      delete state.checklistCompleted[group.id];
      (group.questions || []).forEach(q => removeProgressIdsForQuestion(q));
      restoreGroupToOriginalPosition(group.subjectName || state.currentSubject?.name || 'unknown', normalizeSectionType(group.type || 'lecture'), group.id);
    });
    saveGroupPreferences();
    rerenderAfterChecklistRelatedChange();
  }

  function removeDialogExtras(){
    const actions = document.querySelector('#dialog-overlay .dialog-actions');
    if(!actions) return;
    actions.querySelectorAll('.dialog-extra-btn').forEach(btn => btn.remove());
  }

  window.confirmCompleteGroup = function(idx){
    const group = (state.currentGroups || [])[idx];
    if(!group) return;
    const isDone = !!state.checklistCompleted[group.id];

    removeDialogExtras();

    if(isDone){
      showDialog({
        title:'إعادة الدراسة',
        message:`<div>هل تريد إعادة دراسة <strong>${escapeHtml(group.name)}</strong>؟</div><div style="margin-top:8px;color:var(--text-light)">سيتم إزالة التحديد عنها من هنا ومن قسم Checklist، وتصفير إحصائياتها.</div>`,
        showCancel:true,
        confirmText:'نعم، أعدها للدراسة',
        cancelText:'إلغاء',
        onConfirm:()=>{
          setGroupCompleted(group.id, false, { resetProgress:true });
          showToast('تمت إزالة التحديد وإعادة تصفير إحصائيات العنصر.', 'success');
        }
      });
      return;
    }

    showDialog({
      title:'تأكيد الإنجاز',
      message:`<div style="margin-bottom:10px;">هل أتممت <strong>${escapeHtml(group.name)}</strong> بالفعل؟</div>`,
      showCancel:true,
      confirmText:'نعم',
      cancelText:'إلغاء',
      onConfirm:()=>{
        setGroupCompleted(group.id, true, { moveBottom:false, countAsAnswered:true });
        showToast('تم تعليم العنصر كمكتمل.', 'success');
      },
      onCancel:()=>{}
    });

    setTimeout(() => {
      const actions = document.querySelector('#dialog-overlay .dialog-actions');
      if(!actions) return;
      
      actions.querySelectorAll('.dialog-extra-btn').forEach(btn => btn.remove());

      const confirmBtn = document.getElementById('dialog-confirm');
      const cancelBtn = document.getElementById('dialog-cancel');
      if (!confirmBtn || !cancelBtn) return;

      while (actions.firstChild) {
        actions.removeChild(actions.firstChild);
      }

      confirmBtn.textContent = 'نعم';
      confirmBtn.className = 'btn-primary';
      confirmBtn.onclick = () => {
        hideDialog();
        setGroupCompleted(group.id, true, { moveBottom:false, countAsAnswered:true });
        showToast('تم تعليم العنصر كمكتمل.', 'success');
      };
      actions.appendChild(confirmBtn);

      const moveBtn = document.createElement('button');
      moveBtn.className = 'btn-primary dialog-extra-btn';
      moveBtn.textContent = 'نعم ونقلها للأسفل';
      moveBtn.onclick = function(){
        hideDialog();
        setGroupCompleted(group.id, true, { moveBottom:true, countAsAnswered:true });
        const found = findGroupById(group.id);
        if(found){
          const { subject, sectionType } = found;
          if(Array.isArray(state.currentGroups) && state.currentGroups.length){
            const key = getGroupOrderKey(subject.name, sectionType);
            const newOrder = state.groupPreferences[key] || [];
            state.currentGroups = state.currentGroups.slice().sort((a, b) => {
              const ia = newOrder.indexOf(a.id);
              const ib = newOrder.indexOf(b.id);
              return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
            });
          }
        }
        if(typeof renderSelectionScreenWithEnhancements === 'function') renderSelectionScreenWithEnhancements();
        showToast('تم تعليم العنصر كمكتمل ونقله للأسفل.', 'success');
      };
      actions.appendChild(moveBtn);

      cancelBtn.textContent = 'إلغاء';
      cancelBtn.className = 'btn-secondary';
      cancelBtn.onclick = () => {
        hideDialog();
      };
      actions.appendChild(cancelBtn);

    }, 0);
  };

  window.toggleChecklistGroupCompletion = function(groupId){
    const found = findGroupById(groupId);
    if(!found) return;
    const isDone = !!state.checklistCompleted[groupId];
    removeDialogExtras();
    if(found.sectionType !== 'lectures'){
      showToast('يمكن تعليم المحاضرات فقط في هذا القسم.', 'error');
      return;
    }
    if(isDone){
      showDialog({
        title:'إعادة الدراسة',
        message:`<div>هل تريد إعادة دراسة <strong>${escapeHtml(found.group.name)}</strong>؟</div><div style="margin-top:8px;color:var(--text-light)">سيتم إزالة التحديد عنها من قسم Checklist ومن قسم Exams، وتصفير إحصائياتها.</div>`,
        showCancel:true,
        confirmText:'نعم، أعدها للدراسة',
        cancelText:'إلغاء',
        onConfirm:()=>{
          setGroupCompleted(groupId, false, { resetProgress:true });
          showToast('تمت إزالة التحديد وتصفير إحصائيات المحاضرة.', 'success');
        }
      });
    } else {
      setGroupCompleted(groupId, true, { moveBottom:false, countAsAnswered:true });
      showToast('تم تعليم المحاضرة كمكتملة.', 'success');
    }
  };

  window.toggleChecklistLecture = function(groupId){
    const found = findGroupById(groupId);
    if(!found) return;
    if(found.sectionType !== 'lectures'){
      showToast('يمكن تعليم المحاضرات فقط في هذا القسم.', 'error');
      return;
    }
    const isDone = !!state.checklistCompleted[groupId];
    removeDialogExtras();
    if(isDone){
      showDialog({
        title: 'إعادة الدراسة',
        message: `<div>هل تريد إعادة دراسة <strong>${escapeHtml(found.group.name)}</strong>؟</div><div style="margin-top:8px;color:var(--text-light)">سيتم إزالة التحديد عنها من هنا ومن قسم Checklist، وتصفير إحصائياتها.</div>`,
        showCancel: true,
        confirmText: 'نعم، أعدها للدراسة',
        cancelText: 'إلغاء',
        onConfirm: () => {
          setGroupCompleted(groupId, false, { resetProgress: true });
          showToast('تمت إزالة التحديد وتصفير إحصائيات المحاضرة.', 'success');
        }
      });
      return;
    }
    showDialog({
      title: 'تأكيد الإنجاز',
      message: `<div>هل أتممت <strong>${escapeHtml(found.group.name)}</strong> بالفعل؟</div>`,
      showCancel: true,
      confirmText: 'نعم',
      cancelText: 'إلغاء',
      onConfirm: () => {
        setGroupCompleted(groupId, true, { moveBottom: false, countAsAnswered: true });
        showToast('تم تعليم المحاضرة كمكتملة.', 'success');
      }
    });

    setTimeout(() => {
      const actions = document.querySelector('#dialog-overlay .dialog-actions');
      if(!actions) return;
      actions.querySelectorAll('.dialog-extra-btn').forEach(btn => btn.remove());
      const confirmBtn = document.getElementById('dialog-confirm');
      const cancelBtn = document.getElementById('dialog-cancel');
      if(!confirmBtn || !cancelBtn) return;
      while(actions.firstChild) {
        actions.removeChild(actions.firstChild);
      }
      confirmBtn.textContent = 'نعم';
      confirmBtn.className = 'btn-primary';
      confirmBtn.onclick = () => {
        hideDialog();
        setGroupCompleted(groupId, true, { moveBottom: false, countAsAnswered: true });
        showToast('تم تعليم المحاضرة كمكتملة.', 'success');
      };
      actions.appendChild(confirmBtn);
      const moveBtn = document.createElement('button');
      moveBtn.className = 'btn-primary dialog-extra-btn';
      moveBtn.textContent = 'نعم ونقلها للأسفل';
      moveBtn.onclick = () => {
        hideDialog();
        setGroupCompleted(groupId, true, { moveBottom: true, countAsAnswered: true });
        showToast('تم تعليم المحاضرة كمكتملة ونقلها للأسفل.', 'success');
      };
      actions.appendChild(moveBtn);
      cancelBtn.textContent = 'إلغاء';
      cancelBtn.className = 'btn-secondary';
      cancelBtn.onclick = () => hideDialog();
      actions.appendChild(cancelBtn);
    }, 0);
  };

  function ensureSelectionBulkToolbar(){
    let toolbar = el('selection-bulk-toolbar');
    if(toolbar) return toolbar;
    toolbar = document.createElement('div');
    toolbar.id = 'selection-bulk-toolbar';
    toolbar.className = 'selection-bulk-toolbar hidden';
    toolbar.innerHTML = '<button class="btn-secondary" onclick="openSelectionBulkDialog()">إعادة / إكمال الإنجاز</button><button class="btn-secondary" onclick="restoreCurrentSelectionOriginalOrder()">العودة للترتيب الأصلي</button>';
    const search = el('selection-search-container');
    const screen = el('selection-screen');
    if(search && search.parentNode) search.parentNode.insertBefore(toolbar, search);
    else if(screen) screen.appendChild(toolbar);
    return toolbar;
  }

  function buildEnhancedSelectionList(){
    const list = el('selection-list');
    if(!list) return;
    const meta = state.currentSelectionMeta || {};
    const subjectName = state.currentSubject?.name || (state.currentGroups[0]?.subjectName) || 'unknown';
    const sectionType = normalizeSectionType(meta.sectionType || state.currentGroups[0]?.type);
    state.currentGroups = ensureGroupOrder(state.currentGroups || [], sectionType, subjectName);
    const t = theme();
    list.innerHTML = '';
    state.currentGroups.forEach((group, idx) => {
      const icon = group.type === 'ai' ? t.icons.ai : (group.type === 'year' ? t.icons.years : t.icons.lectures);
      const done = !!state.checklistCompleted[group.id];
      const item = document.createElement('div');
      item.className = 'selection-item selection-group-item' + (done ? ' group-completed' : '') + (state.selectedGroups.includes(idx) ? ' selected' : '');
            item.draggable = !group.isFrequentGroup;
      item.dataset.groupId = group.id;
      item.setAttribute('data-group-name', (group.name + ' ' + (group.subjectName||'')).toLowerCase());
      item.innerHTML = `
        <input type="checkbox" id="group-${idx}" ${state.selectedGroups.includes(idx)?'checked':''} onchange="toggleGroupSelection(${idx})">
        <label for="group-${idx}" style="width:100%; cursor:pointer;">
          <strong class="group-title ${done?'done-title':''}">${icon} ${escapeHtml(group.name)}</strong><br>
          <small class="group-sub ${done?'done-sub':''}" style="color:var(--text-muted)">${group.questions.length} questions</small>
        </label>
        <div class="selection-item-group-actions">
          <button class="selection-complete-btn ${done?'done':''}" title="تعليم كمكتمل أو إعادة الدراسة" onclick="event.stopPropagation(); confirmCompleteGroup(${idx})">${done ? '🔁' : '✅'}</button>
                    ${group.isFrequentGroup ? '<span class="selection-drag-handle" style="cursor:default;">📌</span>' : '<span class="selection-drag-handle" title="اسحب لإعادة الترتيب">↕️</span>'}
        </div>`;

      item.addEventListener('click', function(event){
        if(event.target.closest('input') || event.target.closest('label') || event.target.closest('.selection-complete-btn')) return;
        const cb = item.querySelector('input');
        cb.checked = !cb.checked;
        toggleGroupSelection(idx);
      });

            item.addEventListener('dragstart', e => {
        if(group.isFrequentGroup){ e.preventDefault(); return; }
        item.classList.add('dragging');
        e.dataTransfer.setData('text/plain', group.id);
      });
      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        document.querySelectorAll('#selection-list .selection-group-item').forEach(x=>x.classList.remove('drag-over'));
      });
      item.addEventListener('dragover', e => {
        e.preventDefault();
        item.classList.add('drag-over');
      });
      item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
            item.addEventListener('drop', e => {
        e.preventDefault();
        item.classList.remove('drag-over');
        if(group.isFrequentGroup) return;
        const draggedId = e.dataTransfer.getData('text/plain');
        if(draggedId && draggedId.includes('__frequent__')) return;
        const rect = item.getBoundingClientRect();
        const afterTarget = e.clientY > (rect.top + rect.height / 2);
        reorderGroupIds(subjectName, sectionType, draggedId, group.id, afterTarget);
        saveGroupPreferences();
        renderSelectionScreenWithEnhancements();
        if(typeof updateStatisticsIfOpen === 'function') updateStatisticsIfOpen();
        if(typeof renderChecklist === 'function') renderChecklist();
        if(typeof renderChecklistSubject === 'function' && el('checklist-subject-screen') && el('checklist-subject-screen').classList.contains('active')) renderChecklistSubject();
      });
      list.appendChild(item);
    });
  }
  
  function renderSelectionScreenWithEnhancements(){
    const toolbar = ensureSelectionBulkToolbar();
    if(toolbar) toolbar.classList.toggle('hidden', !shouldEnhanceSelectionScreen());
    if(!shouldEnhanceSelectionScreen()) return;
    buildEnhancedSelectionList();
    updateSelectionFooter();
  }
  window.renderSelectionScreenWithEnhancements = renderSelectionScreenWithEnhancements;

  window.openSelectionBulkDialog = function(){
    if(!shouldEnhanceSelectionScreen() || !Array.isArray(state.currentGroups) || !state.currentGroups.length) return;
    removeDialogExtras();
    showDialog({
      title:'إدارة هذا القسم',
      message:'<div>يمكنك تعليم كل العناصر في هذا القسم كمكتملة أو إعادة تعيينها.</div>',
      showCancel:true,
      confirmText:'تحديد الكل كمنجز',
      cancelText:'إلغاء',
      onConfirm:()=>{
        hideDialog();
        showDialog({
          title:'تأكيد',
          message:'هذا الإجراء لا يمكن التراجع عنه. هل تريد تحديد كل العناصر كمنجزة؟',
          showCancel:true,
          confirmText:'تأكيد',
          cancelText:'إلغاء',
          onConfirm:()=>{
            markGroupsCompletedBulk(state.currentGroups.slice());
            showToast('تم تعليم كل عناصر هذا القسم كمكتملة.', 'success');
          }
        });
        setTimeout(() => removeDialogExtras(), 0);
      }
    });

    setTimeout(() => {
      const actions = document.querySelector('#dialog-overlay .dialog-actions');
      if(!actions) return;
      removeDialogExtras();
      const confirmBtn = document.getElementById('dialog-confirm');
      const cancelBtn = document.getElementById('dialog-cancel');
      if(confirmBtn && confirmBtn.parentNode === actions) actions.removeChild(confirmBtn);
      if(cancelBtn && cancelBtn.parentNode === actions) actions.removeChild(cancelBtn);
      const resetBtn = document.createElement('button');
      resetBtn.className = 'btn-secondary dialog-extra-btn';
      resetBtn.textContent = 'إعادة تعيين';
      resetBtn.onclick = function(){
        hideDialog();
        showDialog({
          title:'تأكيد',
          message:'هذا الإجراء لا يمكن التراجع عنه. هل تريد إعادة تعيين كل العناصر؟',
          showCancel:true,
          confirmText:'تأكيد',
          cancelText:'إلغاء',
          onConfirm:()=>{
            resetGroupsCompletionBulk(state.currentGroups.slice());
            showToast('تمت إعادة تعيين هذا القسم وتصفير إحصائياته.', 'success');
          }
        });
        setTimeout(() => removeDialogExtras(), 0);
      };
      if(cancelBtn) actions.appendChild(cancelBtn);
      actions.appendChild(resetBtn);
      if(confirmBtn) actions.appendChild(confirmBtn);
    }, 0);
  };
  
  window.restoreCurrentSelectionOriginalOrder = function(){
    if(!state.currentGroups || !state.currentGroups.length) return;
    const subjectName = state.currentSubject?.name || state.currentGroups[0]?.subjectName || 'unknown';
    const sectionType = normalizeSectionType((state.currentSelectionMeta || {}).sectionType || state.currentGroups[0]?.type);
    resetSectionToOriginalOrder(subjectName, sectionType);
    renderSelectionScreenWithEnhancements();
    showToast('تم إعادة ترتيب المحاضرات وفقًا للترتيب الأصلي.', 'success');
  };

  THEMES.doctor = {
    icons:{exams:'🩺',wrong:'💉',favorites:'🫀',checklist:'☑️',search:'🔎',statistics:'🧾',settings:'⚕️',lectures:'🧠',ai:'🧬',years:'📅',start:'🏥',results:'🏅',progress:'📈',location:'📍',success:'✅',error:'💉',review:'📝',subject:'🩻'},
    texts:{startExam:'🏥 Start Round',resultsTitle:'Clinical Report',statsTitle:'🧾 إحصائيات الطبيب',settingsTitle:'⚕️ إعدادات الطبيب',examSettingsTitle:'⚕️ Clinical Settings',examSettingsButton:'⚕️ Exam Settings',trainingLabel:'Clinical Training',examLabel:'Clinical Exam'}
  };
  THEMES.castle = {
    icons:{exams:'🪖',wrong:'💥',favorites:'🏅',checklist:'☑️',search:'🔎',statistics:'📍',settings:'⚔️',lectures:'📜',ai:'🛰️',years:'📅',start:'🪖',results:'🎖️',progress:'📈',location:'📍',success:'🎯',error:'💥',review:'📝',subject:'🪖'},
    texts:{startExam:'🪖 Start Battle',resultsTitle:'War Report',statsTitle:'📍 إحصائيات الحرب',settingsTitle:'⚔️ إعدادات الحرب',examSettingsTitle:'⚔️ War Settings',examSettingsButton:'⚙️ Exam Settings',trainingLabel:'War Training',examLabel:'Battle Mode'}
  };

  function rebuildThemeSelectors(){
    const options = [
      ['default','الافتراضي'],
      ['doctor','الطبيب'],
      ['desert','البادية'],
      ['pirates','القراصنة'],
      ['castle','الحرب'],
      ['space','الفضاء'],
      ['lab','المختبر']
    ];
    [el('theme-selector'), el('exam-theme-selector')].filter(Boolean).forEach(sel => {
      const current = sel.value || state.settings.theme || 'default';
      sel.innerHTML = options.map(([value,label]) => `<option value="${value}">${label}</option>`).join('');
      sel.value = options.some(([value]) => value === current) ? current : 'default';
    });
  }

  function updateDarkModeSettingVisibility(){
    const row = el('dark-mode-setting');
    const toggle = el('dark-mode-toggle');
    const isDefault = (state.settings.theme || 'default') === 'default';
    if(row) row.style.display = isDefault ? '' : 'none';
    if(toggle) toggle.disabled = !isDefault;
  }

  const __origLoadSettings = typeof loadSettings === 'function' ? loadSettings : null;
  const __origSyncSettingsControls = typeof syncSettingsControls === 'function' ? syncSettingsControls : null;
  const __origApplyThemeUI = typeof applyThemeUI === 'function' ? applyThemeUI : null;
  const __origApplyBackgroundSound = typeof applyBackgroundSound === 'function' ? applyBackgroundSound : null;
  const __origApplyEffectAudioVolumes = typeof applyEffectAudioVolumes === 'function' ? applyEffectAudioVolumes : null;

  loadSettings = function(){
    if(__origLoadSettings) __origLoadSettings();
    else state.settings = Object.assign({}, DEFAULT_SETTINGS);
  };
  syncSettingsControls = function(){
    if(__origSyncSettingsControls) __origSyncSettingsControls();
    rebuildThemeSelectors();
    updateDarkModeSettingVisibility();
  };
  applyThemeUI = function(){
    if(__origApplyThemeUI) __origApplyThemeUI();
    rebuildThemeSelectors();
  };
  applySettings = function(){
    state.settings = Object.assign({}, DEFAULT_SETTINGS, state.settings || {});
    const darkAllowed = (state.settings.theme || 'default') === 'default';
    document.documentElement.setAttribute('data-dark', String(darkAllowed && !!state.settings.darkMode));
    document.documentElement.setAttribute('data-theme', state.settings.theme || 'default');
    document.documentElement.setAttribute('data-animations', String(state.settings.animations !== false));
    if(typeof syncSettingsControls === 'function') syncSettingsControls();
    if(typeof applyThemeUI === 'function') applyThemeUI();
    if(__origApplyBackgroundSound) __origApplyBackgroundSound();
    if(__origApplyEffectAudioVolumes) __origApplyEffectAudioVolumes();
    updateDarkModeSettingVisibility();
    ensureGlobalHomeButtons();
  };
  changeTheme = (function(original){
    return function(name){
      if(typeof original === 'function') original(name);
      else{
        state.settings.theme = THEMES[name] ? name : 'default';
        saveSettings();
        applySettings();
      }
    };
  })(typeof changeTheme === 'function' ? changeTheme : null);

  buildCategoryCard = function(type, title, badgeText, itemCount, totalQuestions, enabled){
    if(!enabled) return '';
    const countLabel = type === 'years' ? 'الدُفع السابقة' : 'المحاضرات';
    return `<button class="category-card" onclick="openSubjectCategory('${type}')"><span class="category-badge">${badgeText}</span><div class="category-meta"><div><span>${countLabel}</span><strong>${itemCount}</strong></div><div><span>الأسئلة</span><strong>${totalQuestions}</strong></div></div></button>`;
  };
  
    subjectMetaRows = function(subject){
    const lectureCount = subject.lectures.length;
    const lectureQuestions = countQuestions(subject.lectures);
    const rows = [
      `<div><span>Lectures</span><strong>${lectureCount}</strong></div>`,
      `<div><span>Questions</span><strong>${lectureQuestions}</strong></div>`
    ];
    if(subject.years.length){
      rows.push(`<div><span>Years</span><strong dir="ltr" style="display:flex; flex-direction:column; align-items:flex-start; text-align:left;"><span dir="ltr">${subject.years.length} Batches</span><small dir="ltr" style="display:block; text-align:left;">${countUniqueYearsQuestions(subject)}Q</small></strong></div>`);
    }
    if(subject.ai.length){
      rows.push(`<div><span>AI Questions</span><strong>${countQuestions(subject.ai)}</strong></div>`);
    }
    return rows.join('');
  };

  function shouldCountYearsOnlyInSubjectSummary(settings){
    return !!settings && settings.lectures === false && settings.ai === false && settings.years !== false;
  }

  const __origGetSubjectTotalQuestionsPatch = typeof getSubjectTotalQuestions === 'function' ? getSubjectTotalQuestions : null;
  const __origGetSubjectAnsweredCountPatch = typeof getSubjectAnsweredCount === 'function' ? getSubjectAnsweredCount : null;
  
  getSubjectTotalQuestions = function(subject, options = {}){
    const { scope = 'overview', respectVisibilitySettings = false } = options;
    if(!(scope === 'subject' && respectVisibilitySettings)){
      return __origGetSubjectTotalQuestionsPatch ? __origGetSubjectTotalQuestionsPatch(subject, options) : 0;
    }
    const settings = getSubjectVisibilitySettings(subject.id);
    const includeLectures = settings.lectures !== false;
    const includeAi = settings.ai !== false;
    const includeYears = shouldCountYearsOnlyInSubjectSummary(settings);
    let total = 0;
    if(includeLectures) total += (subject.lectures || []).reduce((sum, g) => sum + ((g.questions || []).length), 0);
    if(includeAi) total += (subject.ai || []).reduce((sum, g) => sum + ((g.questions || []).length), 0);
    if(includeYears) total += (subject.years || []).reduce((sum, g) => sum + ((g.questions || []).length), 0);
    return total;
  };

  getSubjectAnsweredCount = function(subject, options = {}){
    const { scope = 'overview', respectVisibilitySettings = false } = options;
    if(!(scope === 'subject' && respectVisibilitySettings)){
      return __origGetSubjectAnsweredCountPatch ? __origGetSubjectAnsweredCountPatch(subject, options) : 0;
    }
    const settings = getSubjectVisibilitySettings(subject.id);
    const answeredSet = new Set();
    function addKey(key){
      const ids = typeof getNormalizedProgressIdsForKey === 'function'
        ? getNormalizedProgressIdsForKey(key)
        : ((state.progress[key] && Array.isArray(state.progress[key].questionIds)) ? Array.from(new Set(state.progress[key].questionIds)) : []);
      ids.forEach(id => answeredSet.add(id));
    }
    if(settings.lectures !== false){
      (subject.lectures || []).forEach(g => addKey(`lecture:${subject.name}/${g.name}`));
    }
    if(settings.ai !== false){
      (subject.ai || []).forEach(g => addKey(`ai:${subject.name}/${g.name}`));
    }
    if(shouldCountYearsOnlyInSubjectSummary(settings)){
      (subject.years || []).forEach(g => addKey(`year:${subject.name}/${g.name}`));
    }
    const total = getSubjectTotalQuestions(subject, options);
    return Math.min(answeredSet.size, total);
  };

  const __origRenderSubjectStatsPatch = typeof renderSubjectStats === 'function' ? renderSubjectStats : null;
  renderSubjectStats = function(){
    const subject = state.currentSubject;
    if(!subject) return;
    const settings = getSubjectVisibilitySettings(subject.id);
    const t = theme();
    if(el('subject-stats-name')) el('subject-stats-name').textContent = subject.name;
    const total = getSubjectTotalQuestions(subject, { scope:'subject', respectVisibilitySettings:true });
    const answered = getSubjectAnsweredCount(subject, { scope:'subject', respectVisibilitySettings:true });
    const remaining = Math.max(0, total - answered);
    const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
    if(el('subject-stats-summary')){
      el('subject-stats-summary').innerHTML = `
        <div class="progress-card">
          <div class="stats-summary-head">
            <h4>${t.icons.subject} ${escapeHtml(subject.name)}</h4>
          </div>
          <p><span>إجمالي الأسئلة</span><strong>${total}</strong></p>
          <p><span>المنجز</span><strong>${answered}</strong></p>
          <p><span>المتبقي</span><strong>${remaining}</strong></p>
          <div class="stats-row stats-percentage-row"><span>نسبة الإنجاز</span><strong>${pct}%</strong></div>
          <div class="progress-bar"><span style="width:${pct}%"></span></div>
        </div>
      `;
    }
    const sections = [];
    let lectures = subject.lectures || [];
    if(typeof window.ensureGroupOrder === 'function') lectures = window.ensureGroupOrder(lectures, 'lectures', subject.name);
    if(lectures.length && settings.lectures !== false){
      sections.push(renderSectionAnalyticsCard(subject,'lecture','المحاضرات',t.icons.lectures,getSectionAnalyticsForGroups(subject, lectures, 'lecture')));
    }
    let years = subject.years || [];
    if(typeof window.ensureGroupOrder === 'function') years = window.ensureGroupOrder(years, 'years', subject.name);
    if(years.length && settings.years !== false){
      sections.push(renderSectionAnalyticsCard(subject,'year','السنوات',t.icons.years,getSectionAnalyticsForGroups(subject, years, 'year')));
    }
    let ai = subject.ai || [];
    if(typeof window.ensureGroupOrder === 'function') ai = window.ensureGroupOrder(ai, 'ai', subject.name);
    if(ai.length && settings.ai !== false){
      sections.push(renderSectionAnalyticsCard(subject,'ai','الذكاء الصناعي',t.icons.ai,getSectionAnalyticsForGroups(subject, ai, 'ai')));
    }
    if(el('subject-stats-sections')){
      el('subject-stats-sections').innerHTML = sections.length ? sections.join('') : '<div class="empty-state"><p>لا توجد أقسام مرئية لهذه المادة حالياً.</p></div>';
    }
  };

  const __origSaveProgressForAutoComplete = typeof saveProgress === 'function' ? saveProgress : null;
  saveProgress = function(){
    if(__origSaveProgressForAutoComplete) __origSaveProgressForAutoComplete();
    const changed = syncAutoCompletedLectures();
    try{ saveChecklistStore(); }catch(e){}
    try{ saveGroupPreferences(); }catch(e){}
    try{ saveProgressStore(); }catch(e){}
    if(changed) rerenderAfterChecklistRelatedChange();
  };

  const __origLoadDataForAutoComplete = typeof loadData === 'function' ? loadData : null;
  loadData = async function(){
    if(__origLoadDataForAutoComplete) await __origLoadDataForAutoComplete();
    const changed = syncAutoCompletedLectures();
    try{ saveChecklistStore(); }catch(e){}
    try{ saveGroupPreferences(); }catch(e){}
    if(changed) rerenderAfterChecklistRelatedChange();
  };

  const __origExecuteResetStatisticsPatch = typeof executeResetStatistics === 'function' ? executeResetStatistics : null;
  executeResetStatistics = function(){
    if(__origExecuteResetStatisticsPatch) __origExecuteResetStatisticsPatch();
    setTimeout(() => {
      if(syncAutoCompletedLectures()) rerenderAfterChecklistRelatedChange();
      else{
        try{ saveChecklistStore(); }catch(e){}
        try{ saveGroupPreferences(); }catch(e){}
        if(typeof renderChecklist === 'function') renderChecklist();
        if(typeof renderChecklistSubject === 'function' && el('checklist-subject-screen') && el('checklist-subject-screen').classList.contains('active')) renderChecklistSubject();
        if(typeof renderSubjects === 'function') renderSubjects();
        if(typeof updateStatisticsIfOpen === 'function') updateStatisticsIfOpen();
        if(typeof renderMemories === 'function') renderMemories();
        if(shouldEnhanceSelectionScreen() && el('selection-screen') && el('selection-screen').classList.contains('active')){
          try{ renderSelectionScreenWithEnhancements(); }catch(e){}
        }
      }
    }, 0);
  };

  const __origResetProgressFullPatch = typeof resetProgressFull === 'function' ? resetProgressFull : null;
  resetProgressFull = function(){
    if(__origResetProgressFullPatch) __origResetProgressFullPatch();
    setTimeout(() => {
      if(syncAutoCompletedLectures()) rerenderAfterChecklistRelatedChange();
      else{
        try{ saveChecklistStore(); }catch(e){}
        try{ saveGroupPreferences(); }catch(e){}
        if(typeof renderChecklist === 'function') renderChecklist();
        if(typeof renderChecklistSubject === 'function' && el('checklist-subject-screen') && el('checklist-subject-screen').classList.contains('active')) renderChecklistSubject();
        if(typeof renderSubjects === 'function') renderSubjects();
        if(typeof updateStatisticsIfOpen === 'function') updateStatisticsIfOpen();
        if(typeof renderMemories === 'function') renderMemories();
        if(shouldEnhanceSelectionScreen() && el('selection-screen') && el('selection-screen').classList.contains('active')){
          try{ renderSelectionScreenWithEnhancements(); }catch(e){}
        }
      }
    }, 0);
  };

  prepareQuestionForExam = function(question){
    const clone = JSON.parse(JSON.stringify(question));
    const baseOptions = (clone.options || []).map(opt => stripOptionPrefix(opt));
    clone.originalOptions = baseOptions.slice();
    clone.options = baseOptions.slice();
    if (clone.isMultiple) {
      clone.correctAnswerText = clone.correctAnswer;
    } else {
      clone.correctAnswerText = getCorrectAnswerText({ ...clone, options: baseOptions, originalOptions: baseOptions.slice() });
      clone.correctAnswer = clone.correctAnswerText;
      clone.correctIndex = resolveCorrectIndex(clone.options, clone.correctAnswerText);
    }
    return clone;
  };

  window.isAnswerCorrect = function(q, ans) {
    if (!q) return false;
    if (q.isMultiple) {
      if (!Array.isArray(ans) || !Array.isArray(q.correctIndices)) return false;
      if (ans.length !== q.correctIndices.length) return false;
      const sortedAns = [...ans].sort();
      const sortedCorr = [...q.correctIndices].sort();
      return sortedAns.every((val, index) => val === sortedCorr[index]);
    }
    return ans === q.correctIndex;
  };

  window.selectOption = function(index) {
  if (!state.currentExam) return;
  const idx = state.currentExam.currentIndex;
  const q = state.currentExam.questions[idx];

  if (state.currentExam.mode === 'training' && state.currentExam.showAnswer) return;

  if (q.isMultiple) {
    if (!Array.isArray(state.currentExam.answers[idx])) {
      state.currentExam.answers[idx] = [];
    }
    const currentAns = state.currentExam.answers[idx];
    const pos = currentAns.indexOf(index);
    if (pos !== -1) {
      currentAns.splice(pos, 1);
    } else {
      currentAns.push(index);
    }
    if (currentAns.length === 0) {
      state.currentExam.answers[idx] = null;
    }
  } else {
    state.currentExam.answers[idx] = index;
  }

  if (state.currentExam.mode !== 'training' || !q.isMultiple) {
    if (state.currentExam.firstAnswers[idx] === null) {
      const ans = state.currentExam.answers[idx];
      state.currentExam.firstAnswers[idx] = Array.isArray(ans) ? [...ans] : ans;
    }
  }

  // تشغيل الصوت والأنيميشن في وضع التدريب
  if (state.currentExam.mode === 'training') {
    const ans = state.currentExam.answers[idx];
    const isCorrect = window.isAnswerCorrect ? window.isAnswerCorrect(q, ans) : false;
    if (ans !== null && isCorrect) {
      // إجابة صحيحة: صوت و أنيميشن
      if (typeof window.playRightSound === 'function') {
        window.playRightSound();
      }
      if (typeof window.triggerTrainingAnimation === 'function') {
        window.triggerTrainingAnimation();
      }
      // إظهار الإجابة الصحيحة تلقائياً
      state.currentExam.showAnswer = true;
    } else if (ans !== null && !isCorrect) {
      // إجابة خاطئة: صوت خطأ
      if (typeof window.playWrongSound === 'function') {
        window.playWrongSound();
      }
      if (!state.wrongQuestions.includes(q.id)) {
        state.wrongQuestions.push(q.id);
        saveWrongQuestions();
      }
    }
  }

  saveExamState();
  renderExam();
};

    window.submitMultipleAnswer = function() {
    if (!state.currentExam) return;
    const idx = state.currentExam.currentIndex;
    const q = state.currentExam.questions[idx];
    const ans = state.currentExam.answers[idx];

    if (state.currentExam.firstAnswers[idx] === null) {
      const savedAns = Array.isArray(ans) ? [...ans] : ans;
      state.currentExam.firstAnswers[idx] = savedAns;
    }
    if (window.isAnswerCorrect(q, ans)) {
      state.currentExam.showAnswer = true;
      if (state.currentExam.mode === 'training') {
        playRightSound();
        triggerTrainingAnimation();
      }
    } else {
      state.currentExam.showAnswer = false;
      if (state.currentExam.mode === 'training') {
        playWrongSound();
      }
      if (!state.wrongQuestions.includes(q.id)) {
        state.wrongQuestions.push(q.id);
        saveWrongQuestions();
      }
    }
    saveExamState();
    renderExam();
  };


  window.submitExamFinish = function() {
    if(!state.currentExam) return;
    state.currentExam.submitted = true;
    state.currentExam.endTime = Date.now();
    if (state.currentExam.mode === 'training') {
      const first = state.currentExam.firstAnswers;
      const ans = state.currentExam.answers;
      for (let i = 0; i < first.length; i++) {
        if (first[i] === null && ans[i] !== null) {
          first[i] = Array.isArray(ans[i]) ? [...ans[i]] : ans[i];
        }
      }
    }
    if(state.currentExam.mode === 'exam'){
      state.currentExam.questions.forEach((q, idx) => {
        const ans = state.currentExam.answers[idx];
        if(ans !== null && !isAnswerCorrect(q, ans) && !state.wrongQuestions.includes(q.id)) state.wrongQuestions.push(q.id);
      });
      saveWrongQuestions();
    }
    clearInterval(state.timerInterval);
    state.timerInterval = null;
    saveProgress();
    recordExamMemory();
    clearExamState();
    if(state.currentExam.mode === 'exam'){
      showScreen('results-screen');
      showWaitingMessages();
    } else {
      showResults();
    }
  };

  function cleanOptionDisplayLocal(text){ return String(text||'').replace(/\u200C+/g,''); }
  function getFormattedCurrentCorrectAnswerLocal(q){
    if (q.isMultiple) {
      if (!q.correctIndices || !q.correctIndices.length) return cleanOptionDisplayLocal(q.correctAnswerText || q.correctAnswer || '');
      return q.correctIndices.map(idx => `${LETTERS[idx]}) ${cleanOptionDisplayLocal(q.options[idx])}`).join(' / ');
    }
    const idx = getCorrectIndex(q);
    if(idx < 0) return cleanOptionDisplayLocal(getCorrectAnswerText(q) || q.correctAnswerText || q.correctAnswer || '');
    return `${LETTERS[idx]}) ${cleanOptionDisplayLocal(q.options[idx])}`;
  }

  function renderOptionButtonLocal(q, opt, i, showAnswerState, userAnswer){
    if (q.isMultiple) {
      let cls = 'option-btn multi-option-btn';
      let isChecked = Array.isArray(userAnswer) && userAnswer.includes(i);
      if (isChecked) cls += ' selected';
      if (showAnswerState) {
         if (q.correctIndices && q.correctIndices.includes(i)) cls += ' correct';
         else if (isChecked && q.correctIndices && !q.correctIndices.includes(i)) cls += ' wrong';
      }
      return `<div class="${cls}" onclick="selectOption(${i})"><div class="checkbox-box ${isChecked ? 'checked' : ''}"></div><span class="option-label">${LETTERS[i]})</span><div class="option-text">${escapeHtml(cleanOptionDisplayLocal(opt))}</div></div>`;
    } else {
      let cls='option-btn';
      if(userAnswer===i) cls+=' selected';
      if(showAnswerState){
        const correctIdx = getCorrectIndex(q);
        if(i===correctIdx) cls+=' correct';
        else if(userAnswer===i && i!==correctIdx) cls+=' wrong';
      }
      return `<button class="${cls}" onclick="selectOption(${i})"><span class="option-label">${LETTERS[i]})</span>${escapeHtml(cleanOptionDisplayLocal(opt))}</button>`;
    }
  }

  function formatQuestionTextWithImage(text) {
    if (!text) return { text: '', imageHtml: '' };
    const match = text.match(/\[img:\s*([^\]]+)\]/i);
    if (match) {
      const imageName = match[1].trim();
      const cleanText = text.replace(/\[img:\s*[^\]]+\]/gi, '').trim();
      const imageHtml = `<div style="margin: 15px 0; text-align: center;"><img src="images/${encodeURIComponent(imageName)}" alt="Question Image" style="max-width: 100%; max-height: 300px; border-radius: 8px; border: 1px solid var(--border-color, #ccc);" onerror="this.style.display='none'"></div>`;
      return { text: cleanText, imageHtml };
    }
    return { text, imageHtml: '' };
  }

  openReadonly = function(questionId){
    const q = state.allQuestions.find(item => item.id === questionId);
    if(!q) return;
    const t = theme();
    const correctIdx = getCorrectIndex(q);
    const fav = state.favorites.includes(q.id);
    const favIcon = fav ? '💚' : '♡';

    const { text: cleanText, imageHtml } = formatQuestionTextWithImage(q.text);

    showScreen('readonly-screen');
        const hasNote = typeof q.note === 'string' && q.note.trim().length > 0;
    const noteBtnHtml = hasNote ? `<button class="icon-btn note-btn" title="Note" onclick="openQuestionNote('${escapeJsString(q.id)}')">⚠</button>` : '';
        const _pgRO = (typeof isValidPageNumber === 'function' ? isValidPageNumber(q.pageNumber) : /^\d+$/.test(String(q.pageNumber||'').trim())) ? String(q.pageNumber).trim() : '';
    el('readonly-content').innerHTML = `<div class="question-header"><span class="question-number">Question ${escapeHtml(q.number||'?')}</span><div class="question-actions"><button class="icon-btn favorite-heart-btn ${fav?'active':''}" data-question-id="${escapeAttribute(q.id)}" aria-pressed="${fav?'true':'false'}" title="${fav?'إزالة من المفضلة':'إضافة إلى المفضلة'}" onclick="toggleFavorite('${q.id}'); openReadonly('${q.id}')">${favIcon}</button>${noteBtnHtml}<button class="icon-btn" onclick="showLocation('${escapeJsString(q.subjectName)}','${escapeJsString(q.lectureName)}','${escapeJsString(q.batchName||'')}','','${escapeJsString(_pgRO)}')">${t.icons.location}</button></div></div><p class="question-text">${escapeHtml(cleanText)}</p>${imageHtml}<div class="options-list">${q.options.map((opt,i)=>{
      if (q.isMultiple) {
         let isCorr = q.correctIndices && q.correctIndices.includes(i);
         let cls = 'option-btn multi-option-btn' + (isCorr ? ' correct' : '');
         return `<div class="${cls}" style="cursor:default;"><div class="checkbox-box ${isCorr ? 'checked' : ''}"></div><span class="option-label">${LETTERS[i]})</span><div class="option-text">${escapeHtml(cleanOptionDisplayLocal(opt))}</div></div>`;
      } else {
         return '<div class="option-btn '+(i===correctIdx?'correct':'')+'" style="cursor:default;"><span class="option-label">'+LETTERS[i]+')</span>'+escapeHtml(cleanOptionDisplayLocal(opt))+'</div>';
      }
    }).join('')}</div><div class="answer-summary"><strong>Correct Answer:</strong> <span class="answer-value">${escapeHtml(getFormattedCurrentCorrectAnswerLocal(q))}</span></div><div class="explanation-box visible"><strong>Explanation:</strong> ${escapeHtml(q.explanation||'No explanation available.')}</div>`;
    el('readonly-content').classList.add('readonly-ltr');
    refreshFavoriteButtonsUI();
  };
        reviewExam = function(){
    if(!state.currentExam) return;
    const reviewDiv=el('results-review');
    reviewDiv.classList.remove('hidden');
    let html='<h3 class="mt-20" style="text-align:right">'+theme().icons.review+' Review</h3>';
    state.currentExam.questions.forEach((q,idx)=>{
      const answersUsed = state.currentExam.mode==='exam' ? state.currentExam.answers : state.currentExam.firstAnswers;
      const userAnswer=answersUsed[idx];
      const correctIdx=getCorrectIndex(q);
      const unanswered = userAnswer===null || (Array.isArray(userAnswer) && userAnswer.length === 0);
      const ok = window.isAnswerCorrect ? window.isAnswerCorrect(q, userAnswer) : userAnswer===correctIdx;
            const statusColor = unanswered ? 'var(--text-muted)' : (ok?'var(--success)':'var(--danger)');
      const statusLabel = unanswered ? 'You didn\'t answer it' : (ok ? theme().icons.success+' Correct' : theme().icons.error+' Wrong');
      
      const { text: cleanText, imageHtml } = formatQuestionTextWithImage(q.text);

      const fav = state.favorites.includes(q.id);
      const favIcon = fav ? '💚' : '♡';
      const hasNote = typeof q.note === 'string' && q.note.trim().length > 0;
      const noteBtnHtml = hasNote ? `<button class="icon-btn note-btn" title="Note" onclick="openQuestionNote('${escapeJsString(q.id)}')">⚠</button>` : '';
      const _pgRV = (typeof isValidPageNumber === 'function' ? isValidPageNumber(q.pageNumber) : /^\d+$/.test(String(q.pageNumber||'').trim())) ? String(q.pageNumber).trim() : '';
      const actionsHtml = `<div class="question-actions"><button class="icon-btn favorite-heart-btn ${fav?'active':''}" data-question-id="${escapeAttribute(q.id)}" aria-pressed="${fav?'true':'false'}" title="${fav?'إزالة من المفضلة':'إضافة إلى المفضلة'}" onclick="toggleFavorite('${escapeJsString(q.id)}')">${favIcon}</button>${noteBtnHtml}<button class="icon-btn" onclick="showLocation('${escapeJsString(q.subjectName)}','${escapeJsString(q.lectureName)}','${escapeJsString(q.batchName||'')}','','${escapeJsString(_pgRV)}')">${theme().icons.location}</button></div>`;

      html += `<div class="question-container review-question-card mt-10" data-review-index="${idx+1}" id="review-q-${idx+1}" style="border-inline-start:4px solid ${statusColor};"><div class="question-header"><span class="question-number">Q${idx+1}</span>${actionsHtml}<span style="color:${statusColor};font-weight:900;">${statusLabel}</span></div><p class="question-text">${escapeHtml(cleanText)}</p>${imageHtml}<div class="options-list">${q.options.map((opt,i)=>{
        if (q.isMultiple) {
          let isCorr = q.correctIndices && q.correctIndices.includes(i);
          let isChecked = Array.isArray(userAnswer) && userAnswer.includes(i);
          let cls = 'option-btn multi-option-btn';
          if (isCorr) cls += ' correct';
          else if (isChecked && !isCorr) cls += ' wrong';
          return `<div class="${cls}" style="cursor:default;"><div class="checkbox-box ${isChecked ? 'checked' : ''}"></div><span class="option-label">${LETTERS[i]})</span><div class="option-text">${escapeHtml(cleanOptionDisplayLocal(opt))}</div></div>`;
        } else {
          let cls='option-btn'; if(i===correctIdx) cls+=' correct'; if(i===userAnswer && i!==correctIdx) cls+=' wrong'; return '<div class="'+cls+'" style="cursor:default;"><span class="option-label">'+LETTERS[i]+')</span>'+escapeHtml(cleanOptionDisplayLocal(opt))+'</div>';
        }
      }).join('')}</div><div class="answer-summary"><strong>Correct Answer:</strong> <span class="answer-value">${escapeHtml(getFormattedCurrentCorrectAnswerLocal(q))}</span></div><div class="explanation-box visible"><strong>Explanation:</strong> ${escapeHtml(q.explanation||'No explanation available.')}</div></div>`;
    });
    reviewDiv.innerHTML=html;
    refreshFavoriteButtonsUI();
    if(typeof ensureReviewFloatingButtons === 'function') ensureReviewFloatingButtons();
  };
  window.convertArabicToEnglishDigits = function(str) {
  if (!str) return '';
  return String(str).replace(/[٠-٩]/g, function(d) {
    return '٠١٢٣٤٥٦٧٨٩'.indexOf(d);
  });
};

window.jumpToReviewQuestion = function(val) {
  if (!val) return;
  const englishVal = convertArabicToEnglishDigits(val);
  const qNum = parseInt(englishVal, 10);
  if (isNaN(qNum) || qNum < 1) return;
  const targetEl = document.getElementById('review-q-' + qNum);
  if (targetEl) {
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

window.updateReviewFloatingVisibility = function() {
  const container = document.getElementById('review-floating-container');
  if (!container) return;
  const resultsScreen = document.getElementById('results-screen');
  const resultsReview = document.getElementById('results-review');
  const isReviewActive = resultsScreen && 
                         resultsScreen.classList.contains('active') && 
                         resultsReview && 
                         !resultsReview.classList.contains('hidden');
  
  if (isReviewActive) {
    container.style.display = 'flex';
  } else {
    container.style.display = 'none';
  }
};

window.ensureReviewFloatingButtons = function() {
  let container = document.getElementById('review-floating-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'review-floating-container';
    container.className = 'review-floating-container';
    document.body.appendChild(container);
  }

  container.innerHTML = `
    <button type="button" class="review-circle-btn" onclick="window.scrollTo({top: 0, behavior: 'smooth'});" title="الانتقال لأعلى">
      <span class="review-arrow">↑</span>
      <span class="review-text-line">الانتقال</span>
      <span class="review-text-line">لأعلى</span>
    </button>
    <div class="review-circle-btn">
      <span class="review-text-line">انتقل</span>
      <span class="review-text-line">إلى</span>
      <span class="review-text-line">السؤال</span>
      <input type="text" id="review-jump-input" class="review-jump-input" autocomplete="off" placeholder="" onkeydown="if(event.key==='Enter'){ jumpToReviewQuestion(this.value); }" onchange="jumpToReviewQuestion(this.value);" />
    </div>
  `;

  updateReviewFloatingVisibility();
};
  renderExamNav = function(){
    if(!state.currentExam) return;
    const nav = el('exam-nav');
    const idx = state.currentExam.currentIndex;
    const last = state.currentExam.questions.length - 1;
    const q = state.currentExam.questions[idx];
    let prevBtn = '<span></span>';
    let nextBtn = '<span></span>';

    if(state.currentExam.direction === 'twoway' && idx > 0){
      prevBtn = '<button class="btn-secondary" onclick="prevQuestion()">Previous ←</button>';
    }

    if(state.currentExam.mode === 'training'){
      const solved = isTrainingQuestionSolved(state.currentExam, idx);
      const showAnswerState = getTrainingShowAnswerState(state.currentExam, idx);

      if(showAnswerState || solved){
        nextBtn = idx < last
          ? '<button class="btn-primary" onclick="nextQuestion()">Next →</button>'
          : '<button class="btn-primary" onclick="finishExam()">Finish</button>';
      } else {
        if (q.isMultiple) {
          const ans = state.currentExam.answers[idx];
          const hasSelection = Array.isArray(ans) && ans.length > 0;
          let btns = '';
          if (hasSelection) {
            btns += `<button class="btn-primary btn-submit" onclick="submitMultipleAnswer()">Submit</button>`;
          }
          if (state.currentExam.firstAnswers[idx] !== null) {
            btns += `<button class="btn-small ml-10" onclick="showAnswer()">Show Answer</button>`;
          }
          nextBtn = `<div style="display:flex; gap:10px; align-items:center;">${btns}</div>`;
        } else if(state.currentExam.answers[idx] !== null){
          nextBtn = '<button class="btn-small" onclick="showAnswer()">Show Answer</button>';
        }
      }
    } else {
      if (q.isMultiple) {
        const ans = state.currentExam.answers[idx];
        if (Array.isArray(ans) && ans.length > 0) {
          nextBtn = idx < last
            ? '<button class="btn-primary" onclick="nextQuestion()">Next →</button>'
            : '<button class="btn-primary" onclick="finishExam()">Finish</button>';
        }
      } else if(state.currentExam.answers[idx] !== null){
        nextBtn = idx < last
          ? '<button class="btn-primary" onclick="nextQuestion()">Next →</button>'
          : '<button class="btn-primary" onclick="finishExam()">Finish</button>';
      }
    }

    nav.innerHTML = prevBtn + nextBtn;
  };

  nextQuestion = function(){
    if(!state.currentExam) return;
    if(state.currentExam.currentIndex < state.currentExam.questions.length - 1){
      state.currentExam.currentIndex += 1;
      if(state.currentExam.mode === 'training'){
        state.currentExam.showAnswer = isTrainingQuestionSolved(state.currentExam, state.currentExam.currentIndex);
      } else {
        state.currentExam.showAnswer = false;
      }
      saveExamState();
      renderExam();
      scrollQuestionIntoView(true);
    }
  };

  prevQuestion = function(){
    if(!state.currentExam || state.currentExam.direction !== 'twoway') return;
    if(state.currentExam.currentIndex > 0){
      state.currentExam.currentIndex -= 1;
      if(state.currentExam.mode === 'training'){
        state.currentExam.showAnswer = isTrainingQuestionSolved(state.currentExam, state.currentExam.currentIndex);
      }
      saveExamState();
      renderExam();
      scrollQuestionIntoView(true);
    }
  };

  navigateToQuestion = function(index){
    if(!state.currentExam) return;
    if(state.currentExam.direction === 'oneway' && index !== state.currentExam.currentIndex) return;
    state.currentExam.currentIndex = index;
    if(state.currentExam.mode === 'training'){
      state.currentExam.showAnswer = isTrainingQuestionSolved(state.currentExam, index);
    }
    saveExamState();
    renderExam();
    scrollQuestionIntoView(true);
  };

    showAnswer = function(){
    if(!state.currentExam) return;
    state.currentExam.showAnswer = true;
    const idx = state.currentExam.currentIndex;
    const q = state.currentExam.questions[idx];
    const ans = state.currentExam.answers[idx] !== null ? state.currentExam.answers[idx] : state.currentExam.firstAnswers[idx];
    const isCorrect = window.isAnswerCorrect(q, ans);
    if (state.currentExam.mode === 'training') {
      if (isCorrect) {
        playRightSound();
        triggerTrainingAnimation();
      } else {
        playWrongSound();
      }
    }
    if(ans !== null && !isCorrect && !state.wrongQuestions.includes(q.id)){
      state.wrongQuestions.push(q.id);
      saveWrongQuestions();
    }
    saveExamState();
    renderExam();
  };

  openStatsExclusionDialog = (function(original){
    return function(){
      if(original) original();
      const yearsInput = el('exclude-years');
      if(yearsInput && yearsInput.parentElement) yearsInput.parentElement.remove();
      if(!state.statsExclusions.excludedSections) state.statsExclusions.excludedSections = { lectures:false, years:false, ai:false };
      state.statsExclusions.excludedSections.years = false;
    };
  })(typeof openStatsExclusionDialog === 'function' ? openStatsExclusionDialog : null);

  applyStatsExclusions = (function(original){
    return function(){
      if(!state.statsExclusions.excludedSections) state.statsExclusions.excludedSections = { lectures:false, years:false, ai:false };
      state.statsExclusions.excludedSections.years = false;
      if(typeof original === 'function') original();
      if(state.statsExclusions.excludedSections) state.statsExclusions.excludedSections.years = false;
      persistStatsExclusions();
    };
  })(typeof applyStatsExclusions === 'function' ? applyStatsExclusions : null);

  function ensureSettingsScreen(){
    let screen = el('settings-screen');
    const panel = el('settings-panel');
    if(screen || !panel) return screen;
    screen = document.createElement('div');
    screen.id = 'settings-screen';
    screen.className = 'screen';
    screen.innerHTML = '<div class="screen-header"><button class="btn-back" onclick="closeSettingsPage()">← رجوع</button><h3>⚙️ الإعدادات</h3></div>';
    panel.parentNode.removeChild(panel);
    panel.classList.add('visible');
    screen.appendChild(panel);
    el('app').appendChild(screen);
    return screen;
  }

  window.closeSettingsPage = function(){ goHome(); };
  
    function ensureReviewFloatingButtons(){
  let container = document.getElementById('review-floating-buttons');
  const svgArrowsIn  = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M4 4 L11 11" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/><path d="M11 11 L11 6" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/><path d="M11 11 L6 11" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/><path d="M20 20 L13 13" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/><path d="M13 13 L13 18" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/><path d="M13 13 L18 13" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/></svg>';
  const svgArrowsOut = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M11 11 L4 4" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/><path d="M4 4 L9 4" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/><path d="M4 4 L4 9" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/><path d="M13 13 L20 20" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/><path d="M20 20 L15 20" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/><path d="M20 20 L20 15" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/></svg>';
  const topWrapHtml = ''
      + '<span class="review-fab-wrap">'
      +   '<button type="button" class="review-fab-btn" id="review-fab-top" onclick="reviewFabTopClick(event)" title="الانتقال لأعلى" aria-label="الانتقال لأعلى">'
      +     '<span class="review-fab-arrow">↑</span>'
      +     '<span class="review-fab-text">الانتقال</span>'
      +     '<span class="review-fab-text">لأعلى</span>'
      +   '</button>'
      +   '<button type="button" class="review-fab-size-toggle" id="review-fab-size-toggle-top" onclick="reviewFabSizeToggle(event)" aria-label="تغيير الحجم">'
      +     svgArrowsIn
      +   '</button>'
      + '</span>';
  const gotoWrapHtml = ''
      + '<span class="review-fab-wrap">'
      +   '<div class="review-fab-btn review-fab-goto" id="review-fab-goto" onclick="reviewFabGotoClick(event)">'
      +     '<span class="review-fab-text">انتقل</span>'
      +     '<span class="review-fab-text">إلى</span>'
      +     '<span class="review-fab-text">السؤال</span>'
      +     '<input type="text" inputmode="numeric" autocomplete="off" placeholder="ادخل رقم السؤال ..." class="review-fab-input" id="review-fab-input" aria-label="رقم السؤال" onkeydown="reviewGotoKey(event)" oninput="reviewNormalizeInput(event)" />'
      +   '</div>'
      +   '<button type="button" class="review-fab-size-toggle" id="review-fab-size-toggle-goto" onclick="reviewFabSizeToggle(event)" aria-label="تغيير الحجم">'
      +     svgArrowsIn
      +   '</button>'
      + '</span>';
  if(!container){
    container = document.createElement('div');
    container.id = 'review-floating-buttons';
    container.className = 'review-floating-buttons';
    container.innerHTML = topWrapHtml + gotoWrapHtml;
    if(document.body){ document.body.appendChild(container); }
  } else {
    container.innerHTML = topWrapHtml + gotoWrapHtml;
    if(container.parentNode !== document.body){ document.body.appendChild(container); }
  }
  window.__reviewFabSvgIn = svgArrowsIn;
  window.__reviewFabSvgOut = svgArrowsOut;
  updateReviewFloatingButtonsVisibility();
}

function reviewFabTopClick(ev){
  if(ev){ ev.stopPropagation(); }
  const container = document.getElementById('review-floating-buttons');
  if(container && container.classList.contains('review-fab-shrunk')){
    reviewFabRestoreSize();
    return;
  }
  reviewScrollToTop();
}

function reviewFabGotoClick(ev){
  const container = document.getElementById('review-floating-buttons');
  if(container && container.classList.contains('review-fab-shrunk')){
    if(ev){ ev.stopPropagation(); }
    reviewFabRestoreSize();
  }
}

function reviewFabSizeToggle(ev){
  if(ev){ ev.stopPropagation(); ev.preventDefault(); }
  const container = document.getElementById('review-floating-buttons');
  if(!container) return;
  if(container.classList.contains('review-fab-shrunk')){
    reviewFabRestoreSize();
  } else {
    container.classList.add('review-fab-shrunk');
    reviewFabUpdateToggleIcons(true);
  }
}

function reviewFabRestoreSize(){
  const container = document.getElementById('review-floating-buttons');
  if(!container) return;
  container.classList.remove('review-fab-shrunk');
  reviewFabUpdateToggleIcons(false);
}

function reviewFabUpdateToggleIcons(shrunk){
  const svg = shrunk ? window.__reviewFabSvgOut : window.__reviewFabSvgIn;
  const t1 = document.getElementById('review-fab-size-toggle-top');
  const t2 = document.getElementById('review-fab-size-toggle-goto');
  if(t1) t1.innerHTML = svg;
  if(t2) t2.innerHTML = svg;
}

  function updateReviewFloatingButtonsVisibility(){
    const container = document.getElementById('review-floating-buttons');
    if(!container) return;
    const resultsScreen = document.getElementById('results-screen');
    const reviewDiv = document.getElementById('results-review');
    const active = !!(resultsScreen && resultsScreen.classList.contains('active') && reviewDiv && !reviewDiv.classList.contains('hidden') && reviewDiv.innerHTML.trim().length>0);
    container.style.display = active ? 'flex' : 'none';
    if(active){
      const input = document.getElementById('review-fab-input');
      if(input){ input.value = ''; }
    }
  }
  function reviewScrollToTop(){
    const resultsScreen = document.getElementById('results-screen');
    try {
      if(resultsScreen){ resultsScreen.scrollTo({ top: 0, behavior: 'smooth' }); }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch(e){
      if(resultsScreen) resultsScreen.scrollTop = 0;
      window.scrollTo(0,0);
    }
  }
  function reviewGotoKey(ev){
    if(ev && (ev.key === 'Enter' || ev.keyCode === 13)){
      ev.preventDefault();
      reviewGotoQuestion();
    }
  }
  function reviewNormalizeInput(ev){
    try {
      const input = ev && ev.target ? ev.target : document.getElementById('review-fab-input');
      if(!input) return;
      const map = {'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9','۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9'};
      let val = String(input.value||'');
      let out = '';
      for(let i=0;i<val.length;i++){
        const ch = val.charAt(i);
        if(map[ch] !== undefined){ out += map[ch]; }
        else if(ch >= '0' && ch <= '9'){ out += ch; }
      }
      if(out !== val){ input.value = out; }
    } catch(e){}
  }
  function reviewGotoQuestion(){
    const input = document.getElementById('review-fab-input');
    if(!input) return;
    let rawVal = String(input.value||'').trim();
    if(!rawVal){ return; }
    const map = {'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9','۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9'};
      let converted = '';
      for(let i=0;i<rawVal.length;i++){
        const ch = rawVal.charAt(i);
        converted += (map[ch] !== undefined ? map[ch] : ch);
      }
    const n = parseInt(converted, 10);
    if(!Number.isFinite(n) || n < 1){
      if(typeof showToast === 'function') showToast('رقم غير صالح','error',1800);
      return;
    }
    const target = document.getElementById('review-q-'+n);
    if(!target){
      if(typeof showToast === 'function') showToast('السؤال رقم '+n+' غير موجود','error',1800);
      return;
    }
    try { target.scrollIntoView({ behavior:'smooth', block:'start' }); } catch(e){ target.scrollIntoView(); }
    input.value = '';
    input.blur();
  }
        window.ensureReviewFloatingButtons = ensureReviewFloatingButtons;
  window.updateReviewFloatingButtonsVisibility = updateReviewFloatingButtonsVisibility;
  window.reviewScrollToTop = reviewScrollToTop;
  window.reviewGotoQuestion = reviewGotoQuestion;
  window.reviewGotoKey = reviewGotoKey;
  window.reviewNormalizeInput = reviewNormalizeInput;
  window.reviewFabTopClick = reviewFabTopClick;
  window.reviewFabGotoClick = reviewFabGotoClick;
  window.reviewFabSizeToggle = reviewFabSizeToggle;
  window.reviewFabRestoreSize = reviewFabRestoreSize;
  window.reviewFabUpdateToggleIcons = reviewFabUpdateToggleIcons;
  (function(){
    const origShowScreen = window.showScreen;
    if(typeof origShowScreen === 'function'){
      window.showScreen = function(id){
        const r = origShowScreen.apply(this, arguments);
        try {
          if(id === 'results-screen'){
            setTimeout(updateReviewFloatingButtonsVisibility, 0);
          } else {
            const c = document.getElementById('review-floating-buttons');
            if(c) c.style.display = 'none';
          }
        } catch(e){}
        return r;
      };
    }
    const origGoHome = window.goHome;
    if(typeof origGoHome === 'function'){
      window.goHome = function(){
        const c = document.getElementById('review-floating-buttons');
        if(c) c.style.display = 'none';
        return origGoHome.apply(this, arguments);
      };
    }
  })();
  function getThemeHomeIcon(){
    const currentTheme = state.settings?.theme || 'default';
    const map = {
      default: '🏠',
      doctor: '🏥',
      desert: '⛺',
      pirates: '🚢',
      castle: '🏰',
      space: '🌍',
      lab: '🏪'
    };
    return map[currentTheme] || '🏠';
  }

  function getHomeButtonText(){
    return `${getThemeHomeIcon()} Home`;
  }

  const __origPlayCelebrateSoundPatch = typeof playCelebrateSound === 'function' ? playCelebrateSound : null;
  playCelebrateSound = function(){
    if(state.settings && state.settings.feedbackEnabled === false) return;
    if(__origPlayCelebrateSoundPatch) __origPlayCelebrateSoundPatch();
  };

  const __origApplyEffectAudioVolumesPatch = typeof applyEffectAudioVolumes === 'function' ? applyEffectAudioVolumes : null;
  applyEffectAudioVolumes = function(){
    if(__origApplyEffectAudioVolumesPatch) __origApplyEffectAudioVolumesPatch();
    const secondsAudio = el('seconds-audio');
    if(secondsAudio) secondsAudio.volume = (state.settings.volume || 50) / 100;
  };

  async function prepareSecondsAudio(){
    let secondsAudio = el('seconds-audio');
    if(!secondsAudio){
      secondsAudio = document.createElement('audio');
      secondsAudio.id = 'seconds-audio';
      secondsAudio.preload = 'auto';
      document.body.appendChild(secondsAudio);
    }
    const candidates = [
      'seconds.mp3',
      'audio/seconds.mp3',
      'assets/audio/seconds.mp3',
      'audio/Seconds.mp3',
      'audio/SECONDS.mp3',
      './audio/seconds.mp3',
      './seconds.mp3'
    ];
    let src = null;
    for(const candidate of candidates){
      try{
        const u = encodeURI(candidate);
        const r = await fetch(u, { method:'HEAD' });
        if(r.ok){
          src = u;
          break;
        }
      }catch(e){}
    }
    if(!src) src = 'audio/seconds.mp3';
    if(secondsAudio.dataset.currentSrc !== src){
      secondsAudio.src = src;
      secondsAudio.dataset.currentSrc = src;
      secondsAudio.load();
    }
    secondsAudio.volume = (state.settings.volume || 50) / 100;
  }

  function playSecondsAlertSound(){
    if(!state.currentExam || state.currentExam.mode !== 'exam') return;
    if(state.settings && state.settings.feedbackEnabled === false) return;
    const secondsAudio = el('seconds-audio');
    if(!secondsAudio || !secondsAudio.src) return;
    try{
      secondsAudio.currentTime = 0;
      secondsAudio.volume = (state.settings.volume || 50) / 100;
      secondsAudio.play().catch(()=>{});
    }catch(e){}
  }
  async function prepareFeedbackAudio(type) {
    const elementId = type === 'right' ? 'right-audio' : 'wrong-audio';
    let audioEl = el(elementId);
    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.id = elementId;
      audioEl.preload = 'auto';
      document.body.appendChild(audioEl);
    }
    if (!audioEl.dataset.currentSrc) {
      const fileName = type === 'right' ? 'right.mp3' : 'wrong.mp3';
      const candidates = [
        fileName,
        `audio/${fileName}`,
        `assets/audio/${fileName}`,
        `./audio/${fileName}`,
        `./${fileName}`
      ];
      let src = null;
      for (const candidate of candidates) {
        try {
          const u = encodeURI(candidate);
          const r = await fetch(u, { method: 'HEAD' });
          if (r.ok) {
            src = u;
            break;
          }
        } catch (e) {}
      }
      if (!src) src = fileName;
      audioEl.src = src;
      audioEl.dataset.currentSrc = src;
      audioEl.load();
    }
    audioEl.volume = (state.settings.volume || 50) / 100;
    return audioEl;
  }

  window.playRightSound = function() {
    if (state.settings && state.settings.feedbackEnabled === false) return;
    prepareFeedbackAudio('right').then(audioEl => {
      if (!audioEl) return;
      try {
        audioEl.currentTime = 0;
        audioEl.volume = (state.settings.volume || 50) / 100;
        audioEl.play().catch(() => {});
      } catch (e) {}
    });
  };

  window.playWrongSound = function() {
    if (state.settings && state.settings.feedbackEnabled === false) return;
    prepareFeedbackAudio('wrong').then(audioEl => {
      if (!audioEl) return;
      try {
        audioEl.currentTime = 0;
        audioEl.volume = (state.settings.volume || 50) / 100;
        audioEl.play().catch(() => {});
      } catch (e) {}
    });
  };

  window.triggerTrainingAnimation = function() {
    if (state.settings && state.settings.animations === false) return;
    if (typeof startFireworks === 'function') {
      startFireworks();
    } else if (typeof triggerAnimation === 'function') {
      triggerAnimation();
    } else if (typeof showFireworks === 'function') {
      showFireworks();
    } else if (typeof launchFireworks === 'function') {
      launchFireworks();
    } else {
      const canvas = el('fireworks-canvas');
      if (canvas) {
        canvas.classList.remove('hidden');
        setTimeout(() => canvas.classList.add('hidden'), 2500);
      }
    }
  };
  const __origStartTimerPatch = typeof startTimer === 'function' ? startTimer : null;
  startTimer = function(){
    clearInterval(state.timerInterval);
    const timerEl = el('exam-timer');
    if(timerEl) timerEl.classList.remove('hidden');
    state.secondsAlertPlayed = false;
    prepareSecondsAudio();

    state.timerInterval = setInterval(() => {
      if(!state.currentExam || state.currentExam.submitted){
        clearInterval(state.timerInterval);
        state.timerInterval = null;
        return;
      }

      const elapsed = Date.now() - state.currentExam.startTime;
      const remaining = state.currentExam.totalTime - elapsed;

      if(remaining <= 0){
        clearInterval(state.timerInterval);
        state.timerInterval = null;
        timeUp();
        return;
      }

      const wholeSecondsRemaining = Math.ceil(remaining / 1000);

      if(!state.secondsAlertPlayed && wholeSecondsRemaining === 11){
        state.secondsAlertPlayed = true;
        playSecondsAlertSound();
      }

      let mins = Math.floor(remaining / 60000);
      let secs = Math.floor((remaining % 60000) / 1000);

      if(timerEl){
        timerEl.textContent = mins + ':' + String(secs).padStart(2,'0');
        timerEl.classList.toggle('timer-danger', remaining <= 60000);
      }
    }, 250);
  };

  function isTrainingQuestionSolved(exam, index){
    if(!exam || exam.mode !== 'training') return false;
    const q = exam.questions[index];
    const answer = exam.answers[index];
    return answer !== null && typeof q !== 'undefined' && window.isAnswerCorrect(q, answer);
  }

  function getTrainingShowAnswerState(exam, index){
    if(!exam || exam.mode !== 'training') return false;
    return !!exam.showAnswer || isTrainingQuestionSolved(exam, index);
  }

  function findFavoriteButtonByQuestionId(questionId){
    return Array.from(document.querySelectorAll('.favorite-heart-btn[data-question-id]')).find(btn => btn.dataset.questionId === String(questionId)) || null;
  }

  function refreshFavoriteButtonsUI(){
    document.querySelectorAll('.favorite-heart-btn[data-question-id]').forEach(btn => {
      const isFav = state.favorites.includes(btn.dataset.questionId);
      btn.textContent = isFav ? '💚' : '♡';
      btn.classList.toggle('active', isFav);
      btn.setAttribute('aria-pressed', isFav ? 'true' : 'false');
      btn.setAttribute('title', isFav ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة');
    });
  }

  function playFavoriteButtonBurst(button){
    if(!button) return;
    const colors = ['#22c55e', '#ffffff', '#86efac', '#ffffff', '#16a34a', '#ffffff'];
    const particleCount = 10;
    for(let i = 0; i < particleCount; i++){
      const particle = document.createElement('span');
      particle.className = 'favorite-burst-particle';
      particle.style.background = colors[i % colors.length];
      const angle = (Math.PI * 2 * i) / particleCount;
      const distance = 8 + (i % 3) * 4;
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance;
      particle.style.setProperty('--fav-burst-x', `${dx}px`);
      particle.style.setProperty('--fav-burst-y', `${dy}px`);
      button.appendChild(particle);
      setTimeout(() => {
        try{ particle.remove(); }catch(e){}
      }, 320);
    }
  }

  const __origToggleFavoriteVisualPatch = typeof toggleFavorite === 'function' ? toggleFavorite : null;
  toggleFavorite = function(questionId){
    const wasFavorite = state.favorites.includes(questionId);
    if(__origToggleFavoriteVisualPatch){
      __origToggleFavoriteVisualPatch(questionId);
    }
    const isFavorite = state.favorites.includes(questionId);
    const toast = el('toast');
    if(toast){
      let message = '';
      if(!wasFavorite && isFavorite){
        message = 'تم إضافة هذا السؤال للمفضلة 💚';
      }else if(wasFavorite && !isFavorite){
        message = 'تم إزالة هذا السؤال من المفضلة 🤍';
      }
      if(message) {
        clearTimeout(state.toastTimer);
        toast.textContent = message;
        toast.classList.remove('hidden');
        toast.classList.add('visible');
        state.toastTimer = setTimeout(() => {
          toast.classList.remove('visible');
          toast.classList.add('hidden');
        }, 2000);
      }
    }
    setTimeout(() => {
      const btn = findFavoriteButtonByQuestionId(questionId);
      if(!wasFavorite && isFavorite && btn) playFavoriteButtonBurst(btn);
      refreshFavoriteButtonsUI();
    }, 0);
  };

  function ensureGlobalHomeButtons(){
    document.querySelectorAll('.screen').forEach(screen => {
      if(!screen || screen.id === 'home-screen' || screen.id === 'settings-screen') return;
      if(screen.id === 'exam-screen'){
        const existingExamHome = screen.querySelector('.btn-home-global');
        if(existingExamHome) existingExamHome.remove();
        return;
      }
      const header = screen.querySelector('.screen-header');
      if(!header) return;
      let btn = header.querySelector('.btn-home-global');
      if(!btn){
        btn = document.createElement('button');
        btn.className = 'btn-secondary btn-home-global';
        btn.style.marginInlineStart = 'auto';
        header.appendChild(btn);
      }
      btn.textContent = getHomeButtonText();
      btn.onclick = goHome;
    });
  }

  toggleSettings = function(){
    if(el('settings-screen') && el('settings-screen').classList.contains('active')){
      goHome();
      return;
    }
    ensureSettingsScreen();
    const panel = el('settings-panel');
    if(panel) panel.classList.add('visible');
    showScreen('settings-screen');
  };

  function renderHistoryDeleteScopeOptions(forceValue){
    const sel = el('history-delete-scope');
    if(!sel) return;
    const subjects = sortSubjects(state.subjects || []).map(s => s.name);
    const current = forceValue || sel.value || state.historyDeleteState.baseScope || 'all';
    sel.innerHTML = '<option value="manual" hidden>يتم التحديد يدويًّا</option><option value="all">كل السجل</option>' + subjects.map(name => `<option value="${escapeAttribute(name)}">${escapeHtml(name)}</option>`).join('');
    const valid = current === 'manual' || current === 'all' || subjects.includes(current);
    sel.value = valid ? current : 'all';
    if(sel.value !== 'manual') state.historyDeleteState.baseScope = sel.value;
  }

  getHistoryItemsForDeletion = function(){
    const scope = el('history-delete-scope')?.value || 'all';
    const actualScope = scope === 'manual' ? (state.historyDeleteState.baseScope || 'all') : scope;
    const base = state.examHistory.slice().sort((a,b)=>(b.endedAt||0)-(a.endedAt||0));
    if(actualScope === 'all') return base;
    return base.filter(item => item.subjectName === actualScope);
  };

  function updateHistoryDeleteScopeManualState(){
    const sel = el('history-delete-scope');
    if(!sel) return;
    const ids = Array.from(document.querySelectorAll('.history-delete-checkbox:checked')).map(cb => cb.value);
    const items = getHistoryItemsForDeletion();
    state.historyDeleteState.ids = ids.slice();
    if(ids.length === items.length && items.length){
      renderHistoryDeleteScopeOptions(state.historyDeleteState.baseScope || 'all');
    }else if(ids.length !== items.length){
      renderHistoryDeleteScopeOptions('manual');
    }
  }

  renderHistoryDeleteList = function(){
    const list = el('history-delete-list');
    const sel = el('history-delete-scope');
    if(!list) return;
    const selectedValue = sel ? (sel.value || state.historyDeleteState.baseScope || 'all') : (state.historyDeleteState.baseScope || 'all');
    const actualScope = selectedValue === 'manual' ? (state.historyDeleteState.baseScope || 'all') : selectedValue;
    const base = state.examHistory.slice().sort((a,b)=>(b.endedAt||0)-(a.endedAt||0));
    const items = actualScope === 'all' ? base : base.filter(item => item.subjectName === actualScope);
    list.innerHTML = items.length ? items.map(item=>`<label class="selection-item selected" style="--subject-color:${getSubjectColor(item.subjectName)}"><input type="checkbox" class="history-delete-checkbox" value="${escapeAttribute(item.id)}" checked><div><div class="history-subject" style="margin-bottom:6px;">${escapeHtml(item.subjectName || 'Unknown Subject')}</div><strong>${escapeHtml(formatHistorySubLabel(item))}</strong><br><small style="color:var(--text-light)">${formatDateTime(item.endedAt)}</small></div></label>`).join('') : '<div class="stats-empty-note">لا توجد عناصر متاحة للحذف.</div>';
    document.querySelectorAll('.history-delete-checkbox').forEach(cb => cb.addEventListener('change', updateHistoryDeleteScopeManualState));
    state.historyDeleteState.ids = items.map(item => item.id);
    state.historyDeleteState.baseScope = actualScope;
    renderHistoryDeleteScopeOptions(selectedValue === 'manual' ? 'manual' : actualScope);
  };

  selectAllHistoryDeleteItems = function(checked){
    document.querySelectorAll('.history-delete-checkbox').forEach(cb=>cb.checked=checked);
    updateHistoryDeleteScopeManualState();
  };

  toggleHistoryDeleteModal = function(show){
    const modal = el('history-delete-modal');
    if(!modal) return;
    modal.classList.toggle('hidden', !show);
    if(show){
      renderHistoryDeleteScopeOptions(state.historyDeleteState.baseScope || 'all');
      renderHistoryDeleteList();
    }
  };
  openHistoryDeleteDialog = function(){ toggleHistoryDeleteModal(true); };

  const __origShowSelectionScreen = typeof showSelectionScreen === 'function' ? showSelectionScreen : null;
  showSelectionScreen = function(groups, title, meta){
    const subjectName = state.currentSubject?.name || groups?.[0]?.subjectName || 'unknown';
    const sectionType = normalizeSectionType(meta?.sectionType || groups?.[0]?.type);
    const ordered = shouldEnhanceSelectionScreen() ? ensureGroupOrder(groups || [], sectionType, subjectName) : (groups || []);
    if(__origShowSelectionScreen) __origShowSelectionScreen(ordered, title, meta);
    const toolbar = ensureSelectionBulkToolbar();
    if(toolbar) toolbar.classList.toggle('hidden', !shouldEnhanceSelectionScreen());
    if(shouldEnhanceSelectionScreen()) renderSelectionScreenWithEnhancements();
    ensureGlobalHomeButtons();
  };

  const __origShowScreen = typeof showScreen === 'function' ? showScreen : null;
  showScreen = function(screenId){
    if(screenId === 'exam-screen' && localStorage.getItem('medical-app-incomplete-exam') && !state.isResumingIncompleteExam){
      showDialog({
        title: 'امتحان غير مكتمل',
        message: '<div>يوجد امتحان غير مكتمل. هل تريد العودة لإستكمال ذاك الامتحان؟</div>',
        showCancel: true,
        confirmText: 'نعم أريد إكمال ذاك الامتحان',
        cancelText: 'لا (ستفقد بيانات التقدم لذاك الامتحان)',
        onConfirm: () => {
          try {
            const saved = JSON.parse(localStorage.getItem('medical-app-incomplete-exam'));
            if(saved) {
              state.currentExam = saved;
              localStorage.removeItem('medical-app-incomplete-exam');
              state.isResumingIncompleteExam = true;
              if(__origShowScreen) __origShowScreen('exam-screen');
              if(typeof renderExam === 'function') renderExam();
              state.isResumingIncompleteExam = false;
              return;
            }
          } catch(e){}
          localStorage.removeItem('medical-app-incomplete-exam');
          if(__origShowScreen) __origShowScreen(screenId);
        },
        onCancel: () => {
          localStorage.removeItem('medical-app-incomplete-exam');
          if(__origShowScreen) __origShowScreen(screenId);
          if(typeof renderExam === 'function') renderExam();
        }
      });
      return;
    }
    if(__origShowScreen) __origShowScreen(screenId);
  };

  function hookExamAudioTogglesForIOS(){
    const bgExam = el('exam-bg-sound-enabled-toggle');
    const feedbackExam = el('exam-feedback-toggle');
    const soundSelectExam = el('exam-sound-selector');

    function commitExamBgToggle(source){
      if(!source) return;
      state.audioUnlocked = true;
      state.settings.bgSoundEnabled = !!source.checked;
      saveSettings();
      applySettings();
      if(el('bg-sound-enabled-toggle')) el('bg-sound-enabled-toggle').checked = !!source.checked;
      if(el('exam-bg-sound-enabled-toggle')) el('exam-bg-sound-enabled-toggle').checked = !!source.checked;
    }

    function commitExamFeedbackToggle(source){
      if(!source) return;
      state.audioUnlocked = true;
      state.settings.feedbackEnabled = !!source.checked;
      saveSettings();
      applySettings();
      if(el('feedback-toggle')) el('feedback-toggle').checked = !!source.checked;
      if(el('exam-feedback-toggle')) el('exam-feedback-toggle').checked = !!source.checked;
    }

    function commitExamSoundSelect(source){
      if(!source) return;
      state.audioUnlocked = true;
      state.settings.bgSound = BACKGROUND_SOUNDS[source.value] ? source.value : 'none';
      saveSettings();
      applySettings();
      if(el('sound-selector')) el('sound-selector').value = state.settings.bgSound;
      if(el('exam-sound-selector')) el('exam-sound-selector').value = state.settings.bgSound;
    }

    if(bgExam && !bgExam.dataset.iosPatched){
      bgExam.dataset.iosPatched = '1';
      bgExam.addEventListener('input', function(e){ commitExamBgToggle(e.currentTarget); });
      bgExam.addEventListener('change', function(e){ commitExamBgToggle(e.currentTarget); });
      bgExam.addEventListener('click', function(){ state.audioUnlocked = true; });
      bgExam.addEventListener('touchstart', function(){ state.audioUnlocked = true; }, { passive:true });
      bgExam.addEventListener('touchend', function(){ state.audioUnlocked = true; commitExamBgToggle(bgExam); }, { passive:true });
    }

    if(feedbackExam && !feedbackExam.dataset.iosPatched){
      feedbackExam.dataset.iosPatched = '1';
      feedbackExam.addEventListener('input', function(e){ commitExamFeedbackToggle(e.currentTarget); });
      feedbackExam.addEventListener('change', function(e){ commitExamFeedbackToggle(e.currentTarget); });
      feedbackExam.addEventListener('click', function(){ state.audioUnlocked = true; });
      feedbackExam.addEventListener('touchstart', function(){ state.audioUnlocked = true; }, { passive:true });
      feedbackExam.addEventListener('touchend', function(){ state.audioUnlocked = true; commitExamFeedbackToggle(feedbackExam); }, { passive:true });
    }

    if(soundSelectExam && !soundSelectExam.dataset.iosPatched){
      soundSelectExam.dataset.iosPatched = '1';
      soundSelectExam.addEventListener('input', function(e){ commitExamSoundSelect(e.currentTarget); });
      soundSelectExam.addEventListener('change', function(e){ commitExamSoundSelect(e.currentTarget); });
      soundSelectExam.addEventListener('click', function(){ state.audioUnlocked = true; });
      soundSelectExam.addEventListener('touchstart', function(){ state.audioUnlocked = true; }, { passive:true });
    }
  }

  function isMemoryDarkSingleLineTheme(){
    const themeName = (state.settings && state.settings.theme) ? state.settings.theme : 'default';
    const isDefaultDark = themeName === 'default' && !!state.settings.darkMode;
    return themeName === 'castle' || themeName === 'space' || themeName === 'lab' || isDefaultDark;
  }
  function getMemorySingleLineColor(){ return isMemoryDarkSingleLineTheme() ? '#ffffff' : '#000000'; }
  function getMemoryCanvasTextColor(){ return isMemoryDarkSingleLineTheme() || isDarkTheme() ? '#e5eefb' : '#475569'; }
  function getMemoryCanvasGridColor(){ return isMemoryDarkSingleLineTheme() || isDarkTheme() ? 'rgba(148,163,184,.28)' : 'rgba(148,163,184,.35)'; }
  function getMemoryCanvasAxisColor(){ return isMemoryDarkSingleLineTheme() || isDarkTheme() ? 'rgba(226,232,240,.72)' : 'rgba(100,116,139,.9)'; }
  function getMemoryOutlineColor(){ return isMemoryDarkSingleLineTheme() || isDarkTheme() ? 'rgba(15,23,42,.92)' : 'rgba(255,255,255,.94)'; }
  function getPatchStartOfDay(date){ const d = new Date(date); d.setHours(0,0,0,0); return d; }
  function getPatchLocalDateKey(date){
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function addPatchDays(date, amount){ const d = new Date(date); d.setDate(d.getDate() + amount); return d; }
  function getPatchStartOfWeek(date){ const d = getPatchStartOfDay(date); const day = d.getDay(); d.setDate(d.getDate() - day); return d; }
  function getPatchEndOfWeek(date){ const d = getPatchStartOfWeek(date); d.setDate(d.getDate() + 6); d.setHours(23,59,59,999); return d; }
  function getPatchStartOfMonth(date){ const d = new Date(date.getFullYear(), date.getMonth(), 1); d.setHours(0,0,0,0); return d; }
  function getPatchEndOfMonth(date){ const d = new Date(date.getFullYear(), date.getMonth() + 1, 0); d.setHours(23,59,59,999); return d; }
  function getPatchStartOfYear(date){ const d = new Date(date.getFullYear(), 0, 1); d.setHours(0,0,0,0); return d; }
  function getPatchEndOfYear(date){ const d = new Date(date.getFullYear(), 11, 31); d.setHours(23,59,59,999); return d; }

  function getPatchMemoryRange(period, offset){
    const now = new Date();
    if(period === 'weekly'){
      const anchor = addPatchDays(now, (offset || 0) * 7);
      const start = getPatchStartOfWeek(anchor);
      const end = getPatchEndOfWeek(anchor);
      return { start, end, caption: `من ${start.toLocaleDateString('ar-EG')} إلى ${end.toLocaleDateString('ar-EG')}` };
    }
    if(period === 'monthly'){
      const anchor = new Date(now.getFullYear(), now.getMonth() + (offset || 0), 1);
      const start = getPatchStartOfMonth(anchor);
      const end = getPatchEndOfMonth(anchor);
      return { start, end, caption: `من ${start.toLocaleDateString('ar-EG')} إلى ${end.toLocaleDateString('ar-EG')}` };
    }
    const anchor = new Date(now.getFullYear() + (offset || 0), 0, 1);
    const start = getPatchStartOfYear(anchor);
    const end = getPatchEndOfYear(anchor);
    return { start, end, caption: `من ${start.toLocaleDateString('ar-EG')} إلى ${end.toLocaleDateString('ar-EG')}` };
  }

  aggregateMemorySeries = function(period, detailed, selectedSubjects, offset){
    const entries = [];
    Object.entries(state.questionsFirstSeen || {}).forEach(([qid, info]) => {
      if(!info || typeof info !== 'object') return;
      const subjectName = info.subjectName || 'غير معروف';
      if(Array.isArray(info.days) && info.days.length){
        info.days.forEach(dayKey => {
          if(!dayKey) return;
          const ts = new Date(`${dayKey}T12:00:00`).getTime();
          if(Number.isFinite(ts)) entries.push({ qid, ts, subjectName, dayKey });
        });
        return;
      }
      const legacyTs = Number(info.ts || 0);
      if(legacyTs > 0){
        const dayKey = getPatchLocalDateKey(legacyTs);
        entries.push({ qid, ts: legacyTs, subjectName, dayKey });
      }
    });

    entries.sort((a,b) => a.ts - b.ts);
    const range = getPatchMemoryRange(period, offset || 0);
    const labels = [];
    const buckets = [];

    if(period === 'weekly'){
      for(let i = 0; i < 7; i++){
        const d = addPatchDays(range.start, i);
        buckets.push(getPatchLocalDateKey(d));
        labels.push(d.toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric' }));
      }
    } else if(period === 'monthly'){
      const days = range.end.getDate();
      for(let i = 1; i <= days; i++){
        const d = new Date(range.start.getFullYear(), range.start.getMonth(), i);
        buckets.push(getPatchLocalDateKey(d));
        labels.push(String(i));
      }
    } else {
      for(let i = 0; i < 12; i++){
        const d = new Date(range.start.getFullYear(), i, 1);
        buckets.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        labels.push(d.toLocaleDateString('ar-EG', { month: 'short' }));
      }
    }

    function getBucketKey(ts){
      const d = new Date(ts);
      if(period === 'yearly') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return getPatchLocalDateKey(d);
    }

    const startTs = range.start.getTime();
    const endTs = range.end.getTime();
    const filteredEntries = entries.filter(e => e.ts >= startTs && e.ts <= endTs);

    if(!detailed){
      const dataMap = new Map();
      filteredEntries.forEach(e => {
        const key = getBucketKey(e.ts);
        const compositeKey = `${key}::${e.qid}`;
        if(!dataMap.has(compositeKey)){
          dataMap.set(compositeKey, true);
        }
      });
      const data = buckets.map(key => {
        let count = 0;
        for(const compositeKey of dataMap.keys()){
          if(compositeKey.startsWith(key + '::')) count++;
        }
        return count;
      });
      return { labels, series: [{ name: 'كل المواد', data, color: getMemorySingleLineColor() }], caption: range.caption };
    }

    const subjects = selectedSubjects && selectedSubjects.length
      ? selectedSubjects.slice()
      : Array.from(new Set(filteredEntries.map(e => e.subjectName))).sort();

    const series = subjects.map(subject => ({
      name: subject,
      color: getSubjectColor(subject),
      data: buckets.map(key => {
        const dataMap = new Map();
        filteredEntries.forEach(e => {
          if(e.subjectName === subject && getBucketKey(e.ts) === key){
            const compositeKey = `${key}::${e.qid}`;
            if(!dataMap.has(compositeKey)){
              dataMap.set(compositeKey, true);
            }
          }
        });
        return dataMap.size;
      })
    }));

    return { labels, series, caption: range.caption };
  };

  drawMemoriesChart = function(canvas, labels, series){
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0)';
    ctx.fillRect(0, 0, w, h);

    const safeLabels = Array.isArray(labels) ? labels : [];
    const safeSeries = Array.isArray(series) && series.length
      ? series
      : [{ name:'كل المواد', data: safeLabels.map(() => 0), color: getMemorySingleLineColor() }];

    const left = 70;
    const right = 20;
    const top = 22;
    const bottom = 74;
    const plotW = w - left - right;
    const plotH = h - top - bottom;

    const maxData = Math.max(0, ...safeSeries.flatMap(s => Array.isArray(s.data) ? s.data : [0]));
    const stepValue = maxData <= 6 ? 1 : Math.max(1, Math.ceil(maxData / 6));
    const displayMax = Math.max(stepValue, Math.ceil(Math.max(maxData, 1) / stepValue) * stepValue);

    for(let value = 0; value <= displayMax; value += stepValue){
      const ratio = value / displayMax;
      const y = Math.round(h - bottom - (ratio * plotH)) + 0.5;
      ctx.strokeStyle = getMemoryCanvasGridColor();
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(w - right, y);
      ctx.stroke();
      ctx.fillStyle = getMemoryCanvasTextColor();
      ctx.font = '12px Inter';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(value), left - 10, y);
    }

    ctx.strokeStyle = getMemoryCanvasAxisColor();
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, h - bottom);
    ctx.lineTo(w - right, h - bottom);
    ctx.stroke();

    const step = safeLabels.length > 1 ? plotW / (safeLabels.length - 1) : plotW;
    safeLabels.forEach((lab, i) => {
      const x = Math.round(left + step * i);
      ctx.save();
      ctx.translate(x, h - bottom + 20);
      ctx.rotate(-0.35);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = getMemoryCanvasTextColor();
      ctx.font = '12px Inter';
      ctx.fillText(lab, 0, 0);
      ctx.restore();
    });

    safeSeries.forEach((s) => {
      const points = (s.data || []).map((value, i) => ({
        x: Math.round(left + step * i),
        y: Math.round(h - bottom - ((value / displayMax) * plotH)),
        value
      }));
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = getMemoryOutlineColor();
      ctx.lineWidth = 6;
      ctx.beginPath();
      points.forEach((point, i) => {
        if(i === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      points.forEach((point, i) => {
        if(i === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
      ctx.fillStyle = s.color;
      points.forEach(point => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    const legendY = h - 18;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    safeSeries.forEach((s, idx) => {
      const x = left + idx * 140;
      ctx.fillStyle = s.color;
      ctx.fillRect(x, legendY - 6, 18, 4);
      ctx.fillStyle = getMemoryCanvasTextColor();
      ctx.font = '12px Inter';
      ctx.fillText(s.name, x + 24, legendY - 4);
    });
  };

  renderMemories = function(){
    if(!el('memories-screen')) return;
    if(!state.memoryOffsets) state.memoryOffsets = { weekly: 0, monthly: 0, yearly: 0 };
    const subjects = sortSubjects(state.subjects).map(s => s.name);
    const filters = el('memory-subject-filters');
    const previousSelected = Array.from(document.querySelectorAll('#memory-subject-filters input:checked')).map(x => x.value);
    if(filters){
      const selection = previousSelected.length ? previousSelected : subjects.slice();
      filters.innerHTML = subjects.length
        ? subjects.map(name => `<label class="memory-subject-chip"><input type="checkbox" value="${escapeAttribute(name)}" ${selection.includes(name) ? 'checked' : ''} onchange="renderMemories()"> <span>${escapeHtml(name)}</span></label>`).join('')
        : '<div class="stats-empty-note">لا توجد مواد بعد.</div>';
    }
    const historyFilter = el('memories-history-filter');
    if(historyFilter){
      const currentValue = historyFilter.value || 'all';
      historyFilter.innerHTML = '<option value="all">كل المواد</option>' + subjects.map(name => `<option value="${escapeAttribute(name)}">${escapeHtml(name)}</option>`).join('');
      historyFilter.value = subjects.includes(currentValue) ? currentValue : 'all';
    }
    const period = el('memory-period') ? el('memory-period').value : 'weekly';
    const mode = el('memory-view-mode') ? el('memory-view-mode').value : 'all';
    const selectedSubjects = Array.from(document.querySelectorAll('#memory-subject-filters input:checked')).map(x => x.value);
    const offset = Number(state.memoryOffsets[period] || 0);
    const data = aggregateMemorySeries(period, mode === 'detailed', selectedSubjects, offset);
    if(el('memory-period-caption')) el('memory-period-caption').textContent = data.caption || '';
    const canvas = el('memories-chart');
    if(canvas) drawMemoriesChart(canvas, data.labels, data.series);
    const prevBtn = el('memory-prev-btn');
    const nextBtn = el('memory-next-btn');
    if(prevBtn) prevBtn.disabled = false;
    if(nextBtn) nextBtn.disabled = offset >= 0;
    const totalUnique = Object.keys(state.questionsFirstSeen || {}).length;
    const totalTime = state.examHistory.reduce((sum, e) => sum + (e.durationMs || 0), 0);
    const summary = el('memories-time-summary');
    if(summary){
      summary.innerHTML = `<div class="progress-card"><h4>أول دخول</h4><p><strong>${formatDateTime(state.firstVisit)}</strong></p></div><div class="progress-card"><h4>عدد الأسئلة الكلي (المُجاب عنها)</h4><p><strong>${totalUnique}</strong></p></div><div class="progress-card"><h4>الوقت الكلي بالامتحانات</h4><p><strong>${formatDuration(totalTime)}</strong></p></div>`;
    }
    const historyList = el('memories-history-list');
    if(historyList){
      const history = getFilteredExamHistory();
      historyList.innerHTML = history.length
        ? history.map(exam => `<div class="memory-history-item" style="--subject-color:${getSubjectColor(exam.subjectName || 'Unknown Subject')}"><div class="history-subject">${escapeHtml(exam.subjectName || 'Unknown Subject')}</div><strong>${escapeHtml(formatHistorySubLabel(exam))}</strong><br><small style="color:var(--text-light)">${formatDateTime(exam.endedAt)}<br>${exam.mode === 'exam' ? 'امتحان فعلي' : 'تدريب'} · ${exam.correct}/${exam.total} · ${exam.score}% · ${formatDuration(exam.durationMs || 0)}</small></div>`).join('')
        : '<div class="stats-empty-note">لا توجد امتحانات مطابقة.</div>';
    }
  };

  changeMemoryPeriodOffset = function(delta){
    if(!state.memoryOffsets) state.memoryOffsets = { weekly: 0, monthly: 0, yearly: 0 };
    const period = el('memory-period') ? el('memory-period').value : 'weekly';
    const currentOffset = Number(state.memoryOffsets[period] || 0);
    const nextOffset = Math.min(0, currentOffset + Number(delta || 0));
    state.memoryOffsets[period] = nextOffset;
    renderMemories();
  };
  window.changeMemoryPeriodOffset = changeMemoryPeriodOffset;

  const st = document.createElement('style');
  st.id = 'medical-app-patch-v5-style';
  st.textContent = `
  [data-theme="default"]{--bg:#ffffff;--bg-card:#ffffff;--text:#132238;--text-light:#4f6179;--text-muted:#8da0b8;--border:#e7eef7;--border-light:#f5f8fc;--shadow:0 8px 24px rgba(37,99,235,.06),0 2px 10px rgba(15,23,42,.03);--shadow-lg:0 20px 45px rgba(37,99,235,.09),0 6px 18px rgba(15,23,42,.05);--card-gradient:linear-gradient(180deg,#ffffff,#ffffff);--button-gradient:linear-gradient(135deg,#2563eb,#38bdf8);--toast-bg:linear-gradient(135deg,rgba(37,99,235,.95),rgba(56,189,248,.92));--toast-border:rgba(255,255,255,.26)}
  [data-theme="doctor"]{--primary:#3b82f6;--primary-light:#7dd3fc;--primary-soft:rgba(59,130,246,.10);--success:#0f766e;--success-soft:rgba(15,118,110,.10);--danger:#dc2626;--danger-soft:rgba(220,38,38,.10);--bg:linear-gradient(180deg,#f8fdff 0%,#eef8ff 100%);--bg-card:#ffffff;--text:#14324a;--text-light:#56728a;--text-muted:#7e9ab1;--border:#d8edf9;--border-light:#eff8fd;--shadow:0 8px 24px rgba(14,116,144,.08),0 2px 10px rgba(15,23,42,.03);--shadow-lg:0 20px 45px rgba(14,116,144,.10),0 6px 18px rgba(15,23,42,.05);--card-gradient:linear-gradient(180deg,rgba(255,255,255,.98),rgba(244,251,255,.98));--button-gradient:linear-gradient(135deg,#3b82f6,#7dd3fc);--toast-bg:linear-gradient(135deg,rgba(37,99,235,.95),rgba(14,165,233,.92));--toast-border:rgba(255,255,255,.22)}
  [data-theme="castle"]{--primary:#7b8f45;--primary-light:#d3c37a;--primary-soft:rgba(123,143,69,.16);--success:#7fb069;--danger:#d97745;--bg:linear-gradient(180deg,#1f2618 0%,#2f3820 40%,#161b12 100%);--bg-card:rgba(32,40,24,.92);--text:#eef6df;--text-light:#c9d5af;--text-muted:#93a07d;--border:rgba(211,195,122,.20);--border-light:rgba(255,255,255,.06);--card-gradient:linear-gradient(180deg,rgba(45,55,33,.94),rgba(24,29,18,.94));--button-gradient:linear-gradient(135deg,#6f8441,#c7b974);--toast-bg:linear-gradient(135deg,rgba(111,132,65,.96),rgba(199,185,116,.92))}
  .answer-summary{margin-top:18px;padding:14px 16px;border-radius:12px;line-height:1.8;background:var(--success-soft);border:1px solid var(--success);color:var(--text)}
  .answer-summary strong,.answer-summary .answer-value{color:inherit}
  .explanation-box{background:linear-gradient(135deg,rgba(37,99,235,.10),rgba(56,189,248,.08));border:1px solid rgba(37,99,235,.28);color:var(--text)}
  [data-theme="desert"] .explanation-box{background:linear-gradient(135deg,rgba(59,130,246,.11),rgba(14,165,233,.08));border-color:rgba(59,130,246,.24)}
  [data-theme="pirates"] .explanation-box{background:linear-gradient(135deg,rgba(59,130,246,.11),rgba(14,165,233,.08));border-color:rgba(59,130,246,.24)}
  [data-theme="doctor"] .explanation-box{background:linear-gradient(135deg,rgba(59,130,246,.12),rgba(125,211,252,.10));border-color:rgba(59,130,246,.24)}
  [data-theme="space"] .explanation-box,[data-theme="castle"] .explanation-box,[data-theme="lab"] .explanation-box{background:linear-gradient(135deg,rgba(251,146,60,.12),rgba(245,158,11,.08));border:1px solid rgba(251,146,60,.28);color:var(--text)}
  .selection-item-group-actions{display:flex;align-items:center;gap:8px;margin-inline-start:auto}
  .selection-complete-btn{border:1px solid var(--border);background:color-mix(in srgb,var(--bg-card) 94%,transparent 6%);color:var(--success);border-radius:10px;padding:8px 10px;cursor:pointer;font-weight:900;min-width:42px}
  .selection-complete-btn.done{background:var(--success-soft);border-color:var(--success)}
  .selection-drag-handle{cursor:grab;user-select:none;padding:8px 10px;border-radius:10px;border:1px dashed var(--border);color:var(--text-light)}
  .selection-group-item.group-completed{background:color-mix(in srgb,var(--success-soft) 60%,var(--bg-card) 40%);border-color:color-mix(in srgb,var(--success) 26%,var(--border) 74%)}
  .selection-group-item .done-title,.selection-group-item .done-sub{text-decoration:line-through;opacity:.65}
  .selection-group-item.dragging{opacity:.55}.selection-group-item.drag-over{border-color:var(--primary);background:var(--primary-soft)}
  #dialog-cancel.btn-secondary{opacity:.68;background:color-mix(in srgb,var(--bg-card) 78%,transparent 22%);color:var(--text-light)}
  #question-container.exam-content-ltr,#question-container.exam-content-ltr .question-text,#question-container.exam-content-ltr .options-list,#question-container.exam-content-ltr .option-btn,#question-container.exam-content-ltr .answer-summary,#question-container.exam-content-ltr .explanation-box,#readonly-content.readonly-ltr,#readonly-content.readonly-ltr .question-text,#readonly-content.readonly-ltr .options-list,#readonly-content.readonly-ltr .option-btn,#results-review .review-question-card,#results-review .review-question-card .question-text,#results-review .review-question-card .options-list,#results-review .review-question-card .option-btn{direction:ltr;text-align:left;unicode-bidi:plaintext}
  #question-container.exam-content-ltr .question-header,#readonly-content.readonly-ltr .question-header{direction:ltr}
  .option-label{color:inherit!important}
  .selection-bulk-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}
  [data-theme="pirates"] .app-subtitle{color:#f7f0d7}
  [data-theme="pirates"] .exam-progress-badge{color:#fff7e3;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.18)}
  #section-exclusions-list{display:flex;flex-direction:column;gap:10px;align-items:flex-start}
  #section-exclusions-list label{display:flex;align-items:center;gap:10px;width:100%}
  .subject-actions{display:none!important}
  .subject-card.actions-open .subject-actions{display:flex!important}
  #exams-hint-bar.hidden{display:none!important}
  #exam-screen .btn-home, #exam-screen .btn-home-global, #exam-screen [class*="home"], #exam-screen [id*="home"] { display: none !important; }
  `;
  document.head.appendChild(st);
    const reviewFloatingStyle = document.createElement('style');
  reviewFloatingStyle.id = 'medical-app-review-floating-style';
  reviewFloatingStyle.textContent = `
  #review-floating-buttons.review-floating-buttons{
    position: fixed;
    right: 18px;
    bottom: 18px;
    left: auto;
    top: auto;
    display: none;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 12px;
    z-index: 9997;
    margin: 0;
    padding: 0;
    pointer-events: auto;
  }
  #review-floating-buttons .review-fab-btn{
    width: 128px;
    height: 128px;
    min-width: 128px;
    min-height: 128px;
    max-width: 128px;
    max-height: 128px;
    border: none;
    border-radius: 50%;
    background: linear-gradient(180deg,#1686f8 0%,#0b6fdf 100%);
    color: #ffffff;
    box-shadow: 0 10px 24px rgba(15,23,42,.20), 0 2px 8px rgba(15,23,42,.12);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 14px 10px;
    box-sizing: border-box;
    overflow: hidden;
    text-align: center;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }
  #review-floating-buttons .review-fab-btn:hover{
    background: linear-gradient(180deg,#117ded 0%,#0965cf 100%);
  }
  #review-floating-buttons #review-fab-top{
    cursor: pointer;
  }
  #review-floating-buttons .review-fab-goto{
    cursor: default;
    padding-top: 16px;
    padding-bottom: 16px;
  }
  #review-floating-buttons .review-fab-arrow{
    display: block;
    width: 100%;
    margin: 0 0 4px 0;
    color: #ffffff;
    font-size: 28px;
    font-weight: 900;
    line-height: 1;
    text-align: center;
  }
  #review-floating-buttons .review-fab-text{
    display: block;
    width: 100%;
    margin: 0;
    padding: 0;
    color: #ffffff;
    font-size: 14px;
    font-weight: 800;
    line-height: 1.2;
    text-align: center;
    white-space: nowrap;
  }
  #review-floating-buttons .review-fab-input{
    display: block;
    width: 76px;
    height: 30px;
    margin: 8px auto 0 auto;
    padding: 0 6px;
    border: 1px solid rgba(255,255,255,.72);
    border-radius: 12px;
    background: rgba(231,236,243,.96);
    color: #0f172a;
    outline: none;
    box-sizing: border-box;
    text-align: center;
    font-size: 15px;
    font-weight: 800;
    line-height: 30px;
    direction: ltr;
    -moz-appearance: textfield;
  }
  #review-floating-buttons .review-fab-input::-webkit-outer-spin-button,
  #review-floating-buttons .review-fab-input::-webkit-inner-spin-button{
    -webkit-appearance: none;
    margin: 0;
  }
  #review-floating-buttons .review-fab-input::placeholder{
    color: transparent;
    opacity: 0;
  }
  #review-floating-buttons .review-fab-input:focus{
    background: #ffffff;
    border-color: rgba(255,255,255,.92);
  }
  @media (max-width: 767px){
    #review-floating-buttons.review-floating-buttons{
      right: 14px;
      bottom: 14px;
      gap: 10px;
    }
    #review-floating-buttons .review-fab-btn{
      width: 116px;
      height: 116px;
      min-width: 116px;
      min-height: 116px;
      max-width: 116px;
      max-height: 116px;
      padding: 12px 8px;
    }
    #review-floating-buttons .review-fab-arrow{
      font-size: 24px;
      margin-bottom: 3px;
    }
    #review-floating-buttons .review-fab-text{
      font-size: 13px;
      line-height: 1.15;
    }
    #review-floating-buttons .review-fab-input{
      width: 70px;
      height: 28px;
      margin-top: 7px;
      font-size: 14px;
      line-height: 28px;
    }
  }
  `;
  document.head.appendChild(reviewFloatingStyle);
  const favoriteFxStyle = document.createElement('style');
  favoriteFxStyle.id = 'medical-app-favorite-fx-style';
  favoriteFxStyle.textContent = `
  .favorite-heart-btn{ position:relative; overflow:visible; }
  .favorite-heart-btn.active{ box-shadow:0 0 0 1px rgba(255,255,255,.16),0 0 12px rgba(34,197,94,.22); }
  .favorite-burst-particle{ position:absolute; left:50%; top:50%; width:6px; height:6px; margin-left:-3px; margin-top:-3px; border-radius:999px; pointer-events:none; opacity:1; transform:translate(0,0) scale(.25); animation:favoriteBurstParticle .3s ease-out forwards; box-shadow:0 0 6px rgba(255,255,255,.45); }
  @keyframes favoriteBurstParticle{ 0%{ opacity:1; transform:translate(0,0) scale(.25); } 100%{ opacity:0; transform:translate(var(--fav-burst-x),var(--fav-burst-y)) scale(1); } }
  [data-theme="default"][data-dark="true"] .grid-btn{ background:rgba(17,24,39,.92)!important; color:var(--text)!important; border:1px solid var(--border)!important; }
  [data-theme="default"][data-dark="true"] .grid-btn.current{ background:var(--button-gradient)!important; color:#ffffff!important; border:2px solid rgba(255,255,255,.78)!important; box-shadow:0 0 0 1px rgba(96,165,250,.28),0 0 14px rgba(96,165,250,.18)!important; }
  [data-theme="default"][data-dark="true"] .grid-btn.answered{ background:linear-gradient(135deg,var(--success),color-mix(in srgb,var(--success) 70%,#ffffff 30%))!important; color:#ffffff!important; border:2px solid color-mix(in srgb,var(--success) 60%,#ffffff 40%)!important; box-shadow:0 0 12px rgba(16,185,129,.16)!important; }
  [data-theme="default"][data-dark="true"] .grid-btn.wrong{ background:linear-gradient(135deg,var(--danger),color-mix(in srgb,var(--danger) 70%,#ffffff 30%))!important; color:#ffffff!important; border:2px solid color-mix(in srgb,var(--danger) 60%,#ffffff 40%)!important; box-shadow:0 0 12px rgba(239,68,68,.16)!important; }
  [data-theme="default"][data-dark="true"] .grid-btn.disabled{ opacity:.4!important; }
  `;
  document.head.appendChild(favoriteFxStyle);
  
  window.addEventListener('beforeunload', () => {
    try{
      const audio = el('bg-audio');
      if(audio){ audio.pause(); audio.currentTime = 0; }
    }catch(e){}
  });

  document.addEventListener('DOMContentLoaded', function(){
    rebuildThemeSelectors();
    try{ if(typeof applySettings === 'function') applySettings(); }catch(e){}
    const yearsInput = el('exclude-years');
    if(yearsInput && yearsInput.parentElement) yearsInput.parentElement.remove();
    if(state.statsExclusions && state.statsExclusions.excludedSections) state.statsExclusions.excludedSections.years = false;
    ensureSelectionBulkToolbar();
    ensureSettingsScreen();
    ensureGlobalHomeButtons();
    hookExamAudioTogglesForIOS();

    document.addEventListener('click', function(e){
      const target = e.target;
      if(!target) return;
      if(typeof showScreen === 'function' && el('exam-screen') && el('exam-screen').classList.contains('active')){
        const text = (target.textContent || '').trim().toLowerCase();
        if(text.includes('exit') || target.closest('.btn-back') || target.id === 'btn-exit'){
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          exitExam();
        }
      }
    }, true);

    document.addEventListener('click', function(ev){
      if(ev.target && (ev.target.id === 'btn-exam-settings' || ev.target.closest('#btn-exam-settings'))){
        setTimeout(hookExamAudioTogglesForIOS, 50);
      }
    }, true);

    document.addEventListener('touchstart', function(ev){
      if(ev.target && (ev.target.id === 'btn-exam-settings' || ev.target.closest('#btn-exam-settings'))){
        setTimeout(hookExamAudioTogglesForIOS, 50);
      }
    }, { passive:true, capture:true });
  });

  window.renderExamTitle = function() {
    if (!state.currentExam) return;
    const subjectNameEl = document.getElementById('exam-subject-name');
    if (!subjectNameEl) return;
  
    const nameFromHistory = state.currentExam.historySubjectName;
    const nameFromQuestions = (state.currentExam.questions && state.currentExam.questions.length) 
        ? (state.currentExam.questions.map(q => q.subjectName).filter(Boolean)[0] || null) 
        : null;
    const fallbackName = state.currentExam.displayLabel || 'Exam';
    
    subjectNameEl.textContent = nameFromHistory || nameFromQuestions || fallbackName;
  };
  
  // -- هذا هو الكود المسؤول عن مطابقة التصميم بالصورة --
  window.renderExamLecturesList = function() {
    const listContainer = document.getElementById('exam-lectures-list');
    const popup = document.getElementById('exam-lectures-popup');
    if (!listContainer || !state.currentExam || !state.currentExam.questions) return;
    
    if(popup) popup.setAttribute('dir', 'ltr');
    
    const counts = {};
    state.currentExam.questions.forEach(q => {
      const key = q.lectureName || q.batchName || q.groupName || 'مواضيع عامة';
      counts[key] = (counts[key] || 0) + 1;
    });
    
    const entries = Object.keys(counts).map(k => ({ name: k, questionCount: counts[k] })).filter(i => i.questionCount > 0);
    
    if (!entries.length) {
      listContainer.innerHTML = '<div style="color:#aaa;font-style:italic;text-align:center;padding:10px;">لا توجد محاضرات</div>';
      return;
    }
    
    entries.sort((a,b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

    let html = '';
    entries.forEach((item) => {
      html += `<div style="display:flex; justify-content:space-between; align-items:stretch; border-bottom:1px solid #fff;">
        <div style="flex:1; text-align:left; font-size:15px; padding: 12px 14px 12px 0; line-height: 1.4; display: flex; align-items: center; letter-spacing: 0.5px;">${escapeHtml(item.name)}</div>
        <div style="flex:0 0 auto; text-align:center; font-weight:bold; font-size:20px; min-width: 50px; padding: 12px 0 12px 14px; border-left: 1px solid #fff; display: flex; align-items: center; justify-content: center;">${item.questionCount}</div>
      </div>`;
    });
    
    listContainer.innerHTML = html;
  };
  
  window.closeExamLecturesPopupOnClickOutside = function(event) {
    const popup = document.getElementById('exam-lectures-popup');
    const btn = document.getElementById('exam-help-btn');
    if (!popup || !btn) return;
    
    if (!popup.contains(event.target) && !btn.contains(event.target)) {
      popup.classList.remove('show');
      document.removeEventListener('click', window.closeExamLecturesPopupOnClickOutside);
      document.removeEventListener('touchstart', window.closeExamLecturesPopupOnClickOutside);
    }
  };
  
  window.toggleExamLecturesPopup = function(event) {
    if(event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const popup = document.getElementById('exam-lectures-popup');
    if (!popup) return;
    
    const isShowing = popup.classList.contains('show');
    if (!isShowing) {
      window.renderExamLecturesList();
      popup.classList.add('show');
      setTimeout(() => {
        document.addEventListener('click', window.closeExamLecturesPopupOnClickOutside);
        document.addEventListener('touchstart', window.closeExamLecturesPopupOnClickOutside);
      }, 0);
    } else {
      popup.classList.remove('show');
      document.removeEventListener('click', window.closeExamLecturesPopupOnClickOutside);
      document.removeEventListener('touchstart', window.closeExamLecturesPopupOnClickOutside);
    }
  };

    renderExam = function(){
    if(!state.currentExam) return;

    if(typeof window.renderExamTitle === 'function') {
      window.renderExamTitle();
    }

    const t = theme();
    const questions = state.currentExam.questions;
    const idx = state.currentExam.currentIndex;
    const q = questions[idx];
    if(!q) return;

    const progressEl = el('exam-progress-compact') || el('exam-progress');
    const timerEl = el('exam-timer');

    if(state.currentExam.mode === 'training'){
      const answered = state.currentExam.firstAnswers.filter(x => x !== null).length;
      const correct = state.currentExam.firstAnswers.filter((ans, i) => ans !== null && (window.isAnswerCorrect ? window.isAnswerCorrect(questions[i], ans) : false)).length;
      const pct = answered > 0 ? Math.round((correct / answered) * 100) : 0;

      if(progressEl){
        progressEl.textContent = `🎯 ${answered}/${questions.length} | ✅${correct} | ${pct}%`;
        progressEl.classList.remove('hidden');
      }
      if(timerEl) timerEl.classList.add('hidden');
    } else {
      if(progressEl) progressEl.classList.add('hidden');
      if(timerEl) timerEl.classList.remove('hidden');
    }

    if(state.currentExam.mode === 'training'){
      state.currentExam.showAnswer = getTrainingShowAnswerState(state.currentExam, idx);
    }

    renderGrid();

    const showAnswerState = state.currentExam.mode === 'training' ? getTrainingShowAnswerState(state.currentExam, idx) : false;
    const fav = state.favorites.includes(q.id);
    const favIcon = fav ? '💚' : '♡';
    const answerSummaryHtml = showAnswerState ? `<div class="answer-summary"><strong>Correct Answer:</strong> <span class="answer-value">${escapeHtml(getFormattedCurrentCorrectAnswerLocal(q))}</span></div>` : '';

    const { text: cleanText, imageHtml } = formatQuestionTextWithImage(q.text);

    const hasNote = typeof q.note === 'string' && q.note.trim().length > 0;
    const noteBtnHtml = hasNote ? `<button class="icon-btn note-btn" title="Note" onclick="openQuestionNote('${escapeJsString(q.id)}')">⚠</button>` : '';

    if(el('question-container')){
      el('question-container').innerHTML = `<div class="question-header"><span class="question-number">Q${idx+1}</span><div class="question-actions"><button class="icon-btn favorite-heart-btn ${fav?'active':''}" data-question-id="${escapeAttribute(q.id)}" aria-pressed="${fav?'true':'false'}" title="${fav?'إزالة من المفضلة':'إضافة إلى المفضلة'}" onclick="toggleFavorite('${q.id}')">${favIcon}</button>${noteBtnHtml}<button class="icon-btn" onclick="toggleQuestionLocation()">${theme().icons.location}</button></div></div><p class="question-text">${escapeHtml(cleanText)}</p>${imageHtml}<div class="options-list">${q.options.map((opt,i)=>renderOptionButtonLocal(q, opt, i, showAnswerState, state.currentExam.answers[idx])).join('')}</div>${answerSummaryHtml}<div class="explanation-box ${showAnswerState?'visible':''}"><strong>Explanation:</strong> ${escapeHtml(q.explanation||'No explanation available.')}</div>${typeof renderRemoveWrongBtn === 'function' ? renderRemoveWrongBtn() : ''}`;
      el('question-container').classList.add('exam-content-ltr');
    }

    refreshFavoriteButtonsUI();
    renderExamNav();
  };

})();
document.addEventListener('DOMContentLoaded', function(){
  prepareSecondsAudio().catch(()=>{});
});
document.addEventListener('DOMContentLoaded', function(){
  refreshFavoriteButtonsUI();
});
