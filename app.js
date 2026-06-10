// State Management
let selectedCourses = [];
let activeTab = "y2-ra-b-c";
let customCourses = [];

// Load selected courses from LocalStorage if available
if (localStorage.getItem("gemini_selected_courses")) {
  try {
    selectedCourses = JSON.parse(localStorage.getItem("gemini_selected_courses"));
  } catch (e) {
    selectedCourses = [];
  }
}

// Load custom courses from LocalStorage if available
if (localStorage.getItem("gemini_custom_courses")) {
  try {
    customCourses = JSON.parse(localStorage.getItem("gemini_custom_courses"));
  } catch (e) {
    customCourses = [];
  }
}

// Bind custom electives into database key
COURSE_DATABASE["custom-elective"] = customCourses;

// Attach Tab ID to each course for easy reference
Object.keys(COURSE_DATABASE).forEach(tabId => {
  COURSE_DATABASE[tabId].forEach(course => {
    course.tabId = tabId;
  });
});

// DOM Elements
const coursesPool = document.getElementById("courses-pool");
const detailsTbody = document.getElementById("details-tbody");
const totalCreditsCell = document.getElementById("total-credits-cell");
const selectedCountBadge = document.getElementById("selected-count-badge");
const studentIdInput = document.getElementById("student-id-input");
const exportPdfBtn = document.getElementById("export-pdf-btn");
const clearScheduleBtn = document.getElementById("clear-schedule-btn");
const tabButtons = document.querySelectorAll(".tab-btn");

// Init App
document.addEventListener("DOMContentLoaded", () => {
  // Create dynamic tooltip
  const tooltip = document.createElement("div");
  tooltip.id = "course-tooltip";
  tooltip.className = "course-tooltip-popup";
  document.body.appendChild(tooltip);
  window.courseTooltip = tooltip;

  initTabs();
  updateCustomTabVisibility();
  renderCoursesPool();
  renderSchedule();
  renderDetailsTable();
  setupEventListeners();

  // Load customized student ID
  if (localStorage.getItem("gemini_student_id")) {
    studentIdInput.value = localStorage.getItem("gemini_student_id");
  }
});

// Setup Action Listeners
function setupEventListeners() {
  studentIdInput.addEventListener("input", (e) => {
    localStorage.setItem("gemini_student_id", e.target.value);
  });

  exportPdfBtn.addEventListener("click", () => {
    window.print();
  });

  clearScheduleBtn.addEventListener("click", () => {
    if (selectedCourses.length === 0) return;
    if (confirm("คุณต้องการล้างวิชาเรียนทั้งหมดในตารางใช่หรือไม่?")) {
      // Animate all items flying back before clearing
      const scheduleItems = document.querySelectorAll(".schedule-item");
      let completed = 0;
      
      if (scheduleItems.length === 0) {
        clearState();
        return;
      }

      scheduleItems.forEach(item => {
        const courseId = item.dataset.id;
        const course = selectedCourses.find(c => c.id === courseId);
        if (course) {
          animateFlyBack(item, course, () => {
            completed++;
            if (completed === scheduleItems.length) {
              clearState();
            }
          });
        }
      });

      // Fallback in case animation fails
      setTimeout(() => {
        if (selectedCourses.length > 0) {
          clearState();
        }
      }, 700);
    }
  });

  // Custom Course Modal Listeners
  const openBtn = document.getElementById("open-add-custom-modal-btn");
  const closeBtn = document.getElementById("close-add-modal-btn");
  const cancelBtn = document.getElementById("cancel-add-btn");
  const modal = document.getElementById("add-course-modal");
  const form = document.getElementById("add-custom-course-form");

  // Flatpickr instances
  let startPicker, endPicker, midtermPicker, finalPicker;

  if (openBtn && modal) {
    openBtn.addEventListener("click", () => {
      modal.style.display = "flex";
      renderColorPresets();

      // Initialize flatpickr when opening modal (destroy first if they exist to prevent leaks)
      if (startPicker) startPicker.destroy();
      if (endPicker) endPicker.destroy();
      if (midtermPicker) midtermPicker.destroy();
      if (finalPicker) finalPicker.destroy();

      startPicker = flatpickr("#custom-start-time", {
        enableTime: true,
        noCalendar: true,
        dateFormat: "H:i",
        time_24hr: true,
        defaultDate: "09:00"
      });

      endPicker = flatpickr("#custom-end-time", {
        enableTime: true,
        noCalendar: true,
        dateFormat: "H:i",
        time_24hr: true,
        defaultDate: "12:00"
      });

      midtermPicker = flatpickr("#custom-midterm-date", {
        dateFormat: "d/m/Y",
        placeholder: "เลือกวันสอบ Midterm"
      });

      finalPicker = flatpickr("#custom-final-date", {
        dateFormat: "d/m/Y",
        placeholder: "เลือกวันสอบ Final"
      });

      // Expose to window for form submission helper
      window.midtermFlatpickr = midtermPicker;
      window.finalFlatpickr = finalPicker;
    });
  }

  const hideModal = () => {
    if (modal) modal.style.display = "none";
    if (form) form.reset();
    
    // Destroy pickers
    if (startPicker) startPicker.destroy();
    if (endPicker) endPicker.destroy();
    if (midtermPicker) midtermPicker.destroy();
    if (finalPicker) finalPicker.destroy();
  };

  if (closeBtn) closeBtn.addEventListener("click", hideModal);
  if (cancelBtn) cancelBtn.addEventListener("click", hideModal);

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        hideModal();
      }
    });
  }

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      addCustomCourseFromForm();
      hideModal();
    });
  }
}

function clearState() {
  hideTooltip();
  selectedCourses = [];
  saveState();
  renderSchedule();
  renderCoursesPool();
  renderDetailsTable();
}

function saveState() {
  localStorage.setItem("gemini_selected_courses", JSON.stringify(selectedCourses));
}

// Tab Switching Logic
function initTabs() {
  tabButtons.forEach(btn => {
    btn.addEventListener("click", (e) => {
      tabButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeTab = btn.dataset.tab;
      renderCoursesPool();
    });
  });
}

// Render Available Courses Pool based on Active Tab
function renderCoursesPool() {
  hideTooltip();
  coursesPool.innerHTML = "";
  const courses = COURSE_DATABASE[activeTab] || [];

  if (courses.length === 0) {
    coursesPool.innerHTML = `<p class="empty-row" style="grid-column: 1/-1; text-align: center;">ไม่มีรายวิชาในกลุ่มนี้</p>`;
    return;
  }

  courses.forEach(course => {
    const exactSecSelected = selectedCourses.some(c => c.id === course.id); // check if this exact section is selected
    
    const card = document.createElement("div");
    card.className = `course-card scale-in ${exactSecSelected ? "selected" : ""}`;
    card.style.setProperty("--course-accent-color", course.color);
    card.dataset.id = course.id;

    // Build schedule time badge representation
    let timeBadgesHtml = "";
    course.slots.forEach(slot => {
      const dayThai = translateDay(slot.day);
      timeBadgesHtml += `
        <div class="time-slot-row">
          <span>📅 <strong>${dayThai}</strong></span>
          <span>⏰ ${slot.startTime} - ${slot.endTime} น. (${slot.type})</span>
        </div>
      `;
    });

    let actionButtonsHtml = "";
    if (activeTab === "custom-elective") {
      actionButtonsHtml = `
        <div style="display: flex; gap: 0.5rem; width: 100%;">
          <button class="course-btn" ${exactSecSelected ? "disabled" : ""} style="flex: 2;">
            ${exactSecSelected ? "เลือกแล้ว" : "เพิ่มเข้าตาราง"}
          </button>
          <button class="btn btn-danger-outline delete-custom-course-btn" style="flex: 1; padding: 0.5rem; justify-content: center; font-size: 0.8rem; margin: 0; min-height: unset; height: auto;" title="ลบวิชานี้ออกจากรายการ">
            🗑️ ลบ
          </button>
        </div>
      `;
    } else {
      actionButtonsHtml = `
        <button class="course-btn" ${exactSecSelected ? "disabled" : ""}>
          ${exactSecSelected ? "เลือกแล้ว" : "เพิ่มเข้าตาราง"}
        </button>
      `;
    }

    card.innerHTML = `
      <div class="course-header">
        <span class="course-code">${course.code}</span>
        <span class="course-credits">${course.credits} หน่วยกิต</span>
      </div>
      <h3 class="course-title">${course.name}</h3>
      <div class="course-instructor">👨‍🏫 ${course.instructor}</div>
      <div class="course-time-badge">
        ${timeBadgesHtml}
      </div>
      <div class="course-exams-card">
        <div>📝 <strong>Mid:</strong> ${course.midterm}</div>
        <div>🏁 <strong>Final:</strong> ${course.final}</div>
      </div>
      ${actionButtonsHtml}
    `;

    // Add click handler for course-btn
    const courseBtn = card.querySelector(".course-btn");
    if (courseBtn && !exactSecSelected) {
      courseBtn.addEventListener("click", (e) => {
        addCourse(course, card);
      });
    }

    // Add click handler for delete-custom-course-btn
    const deleteBtn = card.querySelector(".delete-custom-course-btn");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteCustomCourse(course.id);
      });
    }

    coursesPool.appendChild(card);
  });
}

// Convert Day to Thai Names
function translateDay(day) {
  const mapping = {
    "Monday": "จันทร์",
    "Tuesday": "อังคาร",
    "Wednesday": "พุธ",
    "Thursday": "พฤหัสบดี",
    "Friday": "ศุกร์",
    "Saturday": "เสาร์",
    "Sunday": "อาทิตย์"
  };
  return mapping[day] || day;
}

// Convert Day to Row Index
function dayToRow(day) {
  const mapping = {
    "Monday": 1,
    "Tuesday": 2,
    "Wednesday": 3,
    "Thursday": 4,
    "Friday": 5,
    "Saturday": 6,
    "Sunday": 7
  };
  return mapping[day] || 1;
}

// Check for conflicts
function checkConflict(newCourse) {
  let conflicts = [];
  
  selectedCourses.forEach(existing => {
    newCourse.slots.forEach(newSlot => {
      existing.slots.forEach(existSlot => {
        if (newSlot.day === existSlot.day) {
          const startA = timeToDecimal(newSlot.startTime);
          const endA = timeToDecimal(newSlot.endTime);
          const startB = timeToDecimal(existSlot.startTime);
          const endB = timeToDecimal(existSlot.endTime);
          
          // Overlap condition
          if (startA < endB && startB < endA) {
            conflicts.push(existing);
          }
        }
      });
    });
  });
  
  return conflicts;
}

// Convert "09:30" to 9.5
function timeToDecimal(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return h + m / 60;
}

// Add Course into timetable with animation
function addCourse(course, cardElement) {
  hideTooltip();
  // Add to state
  selectedCourses.push(course);
  saveState();

  // Highlight conflicting items in timetable after adding
  setTimeout(() => {
    highlightConflicts();
  }, 100);

  // Trigger Fly-In Animation
  if (cardElement) {
    const cardRect = cardElement.getBoundingClientRect();
    
    // We render schedule first to get target elements, but make it invisible initially
    renderSchedule();
    renderDetailsTable();
    renderCoursesPool();

    // Find the newly rendered timetable item for this course
    const scheduleItems = document.querySelectorAll(`.schedule-item[data-id="${course.id}"]`);
    scheduleItems.forEach(item => {
      const itemRect = item.getBoundingClientRect();
      
      // Temporarily hide the schedule item
      item.style.opacity = "0";

      // Perform flying animation
      animateFly(cardRect, itemRect, course.color, `${course.code}\n${course.name}`, () => {
        item.style.opacity = "1";
        item.classList.add("scale-in");
      });
    });
  } else {
    renderSchedule();
    renderDetailsTable();
    renderCoursesPool();
  }
}

// Highlight any conflicts in the schedule grid
function highlightConflicts() {
  // Clear previous shake/border highlights
  const items = document.querySelectorAll(".schedule-item");
  items.forEach(item => item.classList.remove("conflict-shake"));

  // Find overlaps
  for (let i = 0; i < selectedCourses.length; i++) {
    for (let j = i + 1; j < selectedCourses.length; j++) {
      const courseA = selectedCourses[i];
      const courseB = selectedCourses[j];
      
      let overlap = false;
      courseA.slots.forEach(slotA => {
        courseB.slots.forEach(slotB => {
          if (slotA.day === slotB.day) {
            const startA = timeToDecimal(slotA.startTime);
            const endA = timeToDecimal(slotA.endTime);
            const startB = timeToDecimal(slotB.startTime);
            const endB = timeToDecimal(slotB.endTime);
            
            if (startA < endB && startB < endA) {
              overlap = true;
            }
          }
        });
      });

      if (overlap) {
        const elA = document.querySelectorAll(`.schedule-item[data-id="${courseA.id}"]`);
        const elB = document.querySelectorAll(`.schedule-item[data-id="${courseB.id}"]`);
        elA.forEach(el => el.classList.add("conflict-shake"));
        elB.forEach(el => el.classList.add("conflict-shake"));
      }
    }
  }
}

// Remove Course with Animation
function removeCourse(courseId) {
  hideTooltip();
  const course = selectedCourses.find(c => c.id === courseId);
  if (!course) return;

  const scheduleItems = document.querySelectorAll(`.schedule-item[data-id="${courseId}"]`);
  
  if (scheduleItems.length > 0) {
    let completed = 0;
    scheduleItems.forEach(item => {
      animateFlyBack(item, course, () => {
        completed++;
        if (completed === scheduleItems.length) {
          // Remove from state
          selectedCourses = selectedCourses.filter(c => c.id !== courseId);
          saveState();
          
          renderSchedule();
          renderCoursesPool();
          renderDetailsTable();
          highlightConflicts();
        }
      });
    });
  } else {
    selectedCourses = selectedCourses.filter(c => c.id !== courseId);
    saveState();
    renderSchedule();
    renderCoursesPool();
    renderDetailsTable();
    highlightConflicts();
  }
}

// Render schedule onto weekly grid with overlap vertical stacking
function renderSchedule() {
  hideTooltip();
  // Clear previous schedule items inside the day rows
  const dayRows = document.querySelectorAll(".day-row");
  dayRows.forEach(row => {
    row.innerHTML = "";
  });

  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  days.forEach(day => {
    const rowContainer = document.querySelector(`.day-row[data-day="${day}"]`);
    if (!rowContainer) return;

    // Get all slots for this day
    const daySlots = [];
    selectedCourses.forEach(course => {
      course.slots.forEach(slot => {
        if (slot.day === day) {
          daySlots.push({
            course: course,
            slot: slot,
            start: timeToDecimal(slot.startTime),
            end: timeToDecimal(slot.endTime)
          });
        }
      });
    });

    // Sort slots by start time
    daySlots.sort((a, b) => a.start - b.start);

    // Greedy track allocation (classic interval coloring)
    const tracks = [];
    daySlots.forEach(item => {
      let placed = false;
      for (let i = 0; i < tracks.length; i++) {
        const hasOverlap = tracks[i].some(existing => {
          return (item.start < existing.end && existing.start < item.end);
        });
        if (!hasOverlap) {
          tracks[i].push(item);
          item.trackIndex = i;
          placed = true;
          break;
        }
      }
      if (!placed) {
        tracks.push([item]);
        item.trackIndex = tracks.length - 1;
      }
    });

    // Render each slot with its computed track height/top
    daySlots.forEach(item => {
      const startD = item.start;
      const endD = item.end;
      
      // Calculate horizontal position (Timetable covers 08:00 - 21:00 = 13 hours total)
      const totalHours = 13;
      const leftPercent = ((startD - 8) / totalHours) * 100;
      const widthPercent = ((endD - startD) / totalHours) * 100;

      // Create block
      const el = document.createElement("div");
      el.className = "schedule-item";
      el.dataset.id = item.course.id;
      el.style.left = `${leftPercent}%`;
      el.style.width = `${widthPercent}%`;
      el.style.backgroundColor = item.course.color;
      el.style.setProperty("--course-accent-color", item.course.color);

      // Stacking styling: split height equally and calculate top offset based on tracks
      el.style.height = `calc((100% - 10px) / ${tracks.length})`;
      el.style.top = `calc(5px + (${item.trackIndex} * 100% / ${tracks.length}))`;

      // Adjust padding and fonts if row height gets too small due to overlaps
      if (tracks.length > 1) {
        el.style.padding = "2px 4px";
        el.style.fontSize = "0.7rem";
      }

      // Shorten titles if block is too small
      let displayTitle = item.course.name;
      if (widthPercent < 10) {
        displayTitle = item.course.code;
      } else if (widthPercent < 18) {
        displayTitle = item.course.name.substring(0, 15) + "...";
      }

      const isOverlapping = tracks.length > 1;
      el.innerHTML = `
        <div class="schedule-item-content">
          <div class="schedule-item-title" style="${isOverlapping ? 'font-size: 0.7rem; line-height: 1.15; white-space: normal;' : ''}">${displayTitle} ${item.slot.type === 'Lab' ? '(Lab)' : ''} ${item.course.section}</div>
          <div class="schedule-item-meta" style="${isOverlapping ? 'display: none;' : ''}">
            <span>👤 ${item.course.instructor.split(' ')[0]}</span>
            <span class="schedule-item-room">📍 ${item.course.room}</span>
          </div>
        </div>
        <button class="schedule-item-remove-btn" title="นำออกจากตาราง">✕</button>
      `;

      // Click event to remove
      el.querySelector(".schedule-item-remove-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        removeCourse(item.course.id);
      });

      // Hover detail tooltip
      el.addEventListener("mouseenter", () => showTooltip(item.course, el));
      el.addEventListener("mouseleave", hideTooltip);

      rowContainer.appendChild(el);
    });
  });

  // Update badge count & credits in real time
  selectedCountBadge.textContent = selectedCourses.length;
  
  const totalCredits = selectedCourses.reduce((sum, c) => sum + c.credits, 0);
  const creditsBadge = document.getElementById("selected-credits-badge");
  if (creditsBadge) {
    creditsBadge.textContent = totalCredits;
  }
}

// Helper to parse midterm exam time into sortable numeric value
function getExamDateTimeValue(examStr) {
  if (!examStr) return Infinity;
  const cleanStr = examStr.trim();
  if (cleanStr.includes("ไม่มี") || cleanStr.includes("ส่งเล่ม") || cleanStr.includes("ประเมิน") || cleanStr.includes("จัดสอบ")) {
    return Infinity; // Put at the bottom
  }
  const parts = cleanStr.split(/\s+/);
  if (parts.length < 3) return Infinity;

  const datePart = parts[1]; // "20/08/2569"
  const timePart = parts[2]; // "16.30-19.30"
  
  const [d, m, y] = datePart.split("/").map(Number);
  const startTime = timePart.split("-")[0]; // "16.30"
  const [hh, mm] = startTime.split(".").map(Number);

  return y * 100000000 + m * 1000000 + d * 10000 + hh * 100 + mm;
}

// Helper to get course year label from tabId or database search
function getCourseYearLabel(course) {
  let tabId = course.tabId;
  if (!tabId) {
    for (const [key, list] of Object.entries(COURSE_DATABASE)) {
      if (list.some(c => c.id === course.id)) {
        tabId = key;
        course.tabId = key;
        break;
      }
    }
  }
  if (!tabId) return "-";
  if (tabId.startsWith("y2")) return "ปี 2";
  if (tabId.startsWith("y3")) return "ปี 3";
  if (tabId.startsWith("y4")) return "ปี 4";
  if (tabId === "custom-elective") return "วิชาเพิ่มเติม";
  return "-";
}

// Render selected courses in details table
function renderDetailsTable() {
  detailsTbody.innerHTML = "";
  let totalCredits = 0;

  const examConflicts = checkExamConflict();
  updateExamConflictsUI(examConflicts);

  if (selectedCourses.length === 0) {
    detailsTbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="10">ยังไม่มีรายวิชาที่เลือก เลือกวิชาด้านบนเพื่อจัดตารางเรียน</td>
      </tr>
    `;
    totalCreditsCell.textContent = 0;
    return;
  }

  // Sort selected courses by midterm exam date
  const sortedCourses = [...selectedCourses].sort((a, b) => {
    return getExamDateTimeValue(a.midterm) - getExamDateTimeValue(b.midterm);
  });

  sortedCourses.forEach(course => {
    totalCredits += course.credits;

    // Time schedule string format
    const timeSlotsStr = course.slots.map(s => {
      return `${translateDay(s.day)}: ${s.startTime}-${s.endTime} (${s.type})`;
    }).join("<br>");

    const midtermConflict = examConflicts.some(c => c.type === "Midterm" && (c.courseA.id === course.id || c.courseB.id === course.id));
    const finalConflict = examConflicts.some(c => c.type === "Final" && (c.courseA.id === course.id || c.courseB.id === course.id));

    const midtermHtml = midtermConflict 
      ? `<span class="conflict-highlight">${course.midterm}</span> <span class="badge-exam-conflict" title="สอบชนกับวิชาอื่นในวันเวลานี้">⚠️ สอบชน!</span>`
      : course.midterm;

    const finalHtml = finalConflict 
      ? `<span class="conflict-highlight">${course.final}</span> <span class="badge-exam-conflict" title="สอบชนกับวิชาอื่นในวันเวลานี้">⚠️ สอบชน!</span>`
      : course.final;

    const tr = document.createElement("tr");
    tr.className = "scale-in";
    tr.innerHTML = `
      <td class="code-val">${course.code}</td>
      <td class="subject-val">
        <span class="subject-color-chip" style="background-color: ${course.color}"></span>
        ${course.name}
      </td>
      <td class="sec-val">${course.section}</td>
      <td class="text-center" style="font-weight: 500;">${getCourseYearLabel(course)}</td>
      <td>${timeSlotsStr}</td>
      <td>${course.instructor}</td>
      <td class="exam-val">${midtermHtml}</td>
      <td class="exam-val">${finalHtml}</td>
      <td class="credits-val">${course.credits}</td>
      <td class="text-center">
        <button class="btn-remove" data-id="${course.id}">นำออก</button>
      </td>
    `;

    tr.querySelector(".btn-remove").addEventListener("click", () => {
      removeCourse(course.id);
    });

    detailsTbody.appendChild(tr);
  });

  totalCreditsCell.textContent = totalCredits;
}

// Fly animation helper (From A to B)
function animateFly(fromRect, toRect, color, text, callback) {
  const flying = document.createElement("div");
  flying.className = "flying-item";
  flying.style.backgroundColor = color;
  flying.style.left = `${fromRect.left}px`;
  flying.style.top = `${fromRect.top}px`;
  flying.style.width = `${fromRect.width}px`;
  flying.style.height = `${fromRect.height}px`;
  flying.innerText = text;

  document.body.appendChild(flying);

  // Trigger reflow
  flying.offsetHeight;

  // Fly to target
  flying.style.left = `${toRect.left}px`;
  flying.style.top = `${toRect.top}px`;
  flying.style.width = `${toRect.width}px`;
  flying.style.height = `${toRect.height}px`;
  flying.style.transform = "scale(0.8)";
  flying.style.opacity = "0.4";

  flying.addEventListener("transitionend", () => {
    flying.remove();
    if (callback) callback();
  }, { once: true });

  // Safety cleanup fallback
  setTimeout(() => {
    if (flying.parentNode) {
      flying.remove();
      if (callback) callback();
    }
  }, 700);
}

// Fly-back animation helper (From Timetable block back to Card or Tab Button)
function animateFlyBack(timetableItem, course, callback) {
  const timetableRect = timetableItem.getBoundingClientRect();
  
  // Find target card in pool
  let targetElement = document.querySelector(`.course-card[data-id="${course.id}"]`);
  
  // If course card is not in current view (because student switched tab), target the tab button
  if (!targetElement) {
    targetElement = document.querySelector(`.tab-btn[data-tab="${course.tabId}"]`);
  }

  if (targetElement) {
    const targetRect = targetElement.getBoundingClientRect();
    
    // Hide timetable item to simulate real-time removal
    timetableItem.style.opacity = "0";

    animateFly(timetableRect, targetRect, course.color, `${course.code}\n${course.name}`, callback);
  } else {
    // If no target is found, just remove instantly
    if (callback) callback();
  }
}

// Tooltip functions for hover detail popup
function showTooltip(course, targetEl) {
  const tooltip = window.courseTooltip;
  if (!tooltip) return;

  // Render slots HTML
  const slotsHtml = course.slots.map(s => {
    return `• <strong>${translateDay(s.day)}</strong>: ${s.startTime} - ${s.endTime} น. (${s.type})`;
  }).join("<br>");

  tooltip.innerHTML = `
    <div class="tooltip-header" style="border-left: 4px solid ${course.color}">
      <span class="tooltip-code">${course.code}</span>
      <span class="tooltip-sec">${course.section}</span>
    </div>
    <div class="tooltip-title">${course.name}</div>
    <div class="tooltip-details">
      <div>📍 <strong>ห้องเรียน:</strong> ${course.room}</div>
      <div>👨‍🏫 <strong>ผู้สอน:</strong> ${course.instructor}</div>
      <div>💳 <strong>หน่วยกิต:</strong> ${course.credits} หน่วยกิต</div>
      <div style="margin-top: 4px;">📅 <strong>เวลาเรียน:</strong><br>${slotsHtml}</div>
      <div class="tooltip-divider"></div>
      <div>📝 <strong>สอบ Midterm:</strong><br><span class="exam-text">${course.midterm}</span></div>
      <div>🏁 <strong>สอบ Final:</strong><br><span class="exam-text">${course.final}</span></div>
    </div>
  `;

  tooltip.classList.add("visible");

  const rect = targetEl.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();

  // Position vertically (prefer top, fallback bottom)
  let top = rect.top + window.scrollY - tooltipRect.height - 10;
  let placement = "top";
  if (top < window.scrollY + 10) {
    top = rect.bottom + window.scrollY + 10;
    placement = "bottom";
  }

  // Position horizontally (center aligned, clamp within screen)
  let left = rect.left + window.scrollX + rect.width / 2;
  const padding = 15;
  const minLeft = window.scrollX + tooltipRect.width / 2 + padding;
  const maxLeft = window.scrollX + window.innerWidth - tooltipRect.width / 2 - padding;
  left = Math.max(minLeft, Math.min(maxLeft, left));

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  tooltip.dataset.placement = placement;
}

function hideTooltip() {
  const tooltip = window.courseTooltip;
  if (tooltip) {
    tooltip.classList.remove("visible");
  }
}

// Check if selected courses have overlapping exam schedules (ignoring sections of the same course, checking bidirectionally)
function checkExamConflict() {
  const conflicts = [];
  const validExams = (str) => {
    if (!str) return false;
    const s = str.trim();
    return s && !s.includes("ไม่มี") && !s.includes("ส่งเล่ม") && !s.includes("ประเมิน");
  };

  for (let i = 0; i < selectedCourses.length; i++) {
    for (let j = i + 1; j < selectedCourses.length; j++) {
      const courseA = selectedCourses[i];
      const courseB = selectedCourses[j];

      // Ignore checking conflicts between sections of the same course
      if (courseA.code === courseB.code) {
        continue;
      }

      // Check midterm overlap
      if (validExams(courseA.midterm) && validExams(courseB.midterm) && courseA.midterm === courseB.midterm) {
        conflicts.push({
          type: "Midterm",
          courseA: courseA,
          courseB: courseB,
          time: courseA.midterm
        });
      }

      // Check final overlap
      if (validExams(courseA.final) && validExams(courseB.final) && courseA.final === courseB.final) {
        conflicts.push({
          type: "Final",
          courseA: courseA,
          courseB: courseB,
          time: courseA.final
        });
      }
    }
  }
  return conflicts;
}

// Render dynamic exam conflicts banner above details table (grouped by course name, deduplicated)
function updateExamConflictsUI(conflicts) {
  const container = document.getElementById("exam-conflict-container");
  if (!container) return;

  if (conflicts.length === 0) {
    container.innerHTML = "";
    return;
  }

  // Group conflicts by main course name (courseA)
  const grouped = {};
  conflicts.forEach(c => {
    const key = c.courseA.name;
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(c);
  });

  let htmlContent = `
    <div class="exam-conflict-alert scale-in">
      <span class="alert-icon">⚠️</span>
      <div class="alert-content">
        <strong>แจ้งเตือนวันเวลาสอบชนกัน! (Exam Schedule Conflict)</strong>
  `;

  Object.keys(grouped).forEach(courseName => {
    // Deduplicate lists items under the same course header
    const uniqueConflicts = [];
    const seen = new Set();
    
    grouped[courseName].forEach(c => {
      // Create a unique key using conflicting course name + exam type + exam time
      const uniqKey = `${c.courseB.name}|${c.type}|${c.time}`;
      if (!seen.has(uniqKey)) {
        seen.add(uniqKey);
        uniqueConflicts.push(c);
      }
    });

    const listItems = uniqueConflicts.map(c => {
      const examTypeLabel = c.type === "Midterm" ? "Midterm" : "Final";
      return `<div class="conflict-sub-item">ชนกับ <strong>${c.courseB.name}</strong> มีกำหนดสอบ <strong>${examTypeLabel}</strong> ซ้อนกันในวันเวลา: <span class="conflict-time-badge">${c.time}</span></div>`;
    }).join("");

    htmlContent += `
      <div class="conflict-group">
        <div class="conflict-main-course">วิชา <strong>${courseName}</strong></div>
        <div class="conflict-sub-list">
          ${listItems}
        </div>
      </div>
    `;
  });

  htmlContent += `
      </div>
    </div>
  `;

  container.innerHTML = htmlContent;
}

// Custom Elective Helper Functions

const PRESET_COLORS = [
  "hsl(210, 75%, 65%)", // Blue
  "hsl(145, 60%, 55%)", // Green
  "hsl(330, 70%, 65%)", // Pink
  "hsl(280, 65%, 60%)", // Purple
  "hsl(35, 85%, 60%)",  // Orange
  "hsl(180, 60%, 50%)", // Teal
  "hsl(15, 75%, 60%)",  // Red
  "hsl(250, 70%, 65%)"  // Indigo
];

let selectedCustomColor = PRESET_COLORS[0];

function updateCustomTabVisibility() {
  const tabBtn = document.getElementById("custom-elective-tab");
  const tabRow = document.getElementById("custom-elective-row");
  if (!tabBtn) return;
  if (customCourses.length > 0) {
    tabBtn.style.display = "block";
    if (tabRow) tabRow.style.display = "flex";
  } else {
    tabBtn.style.display = "none";
    if (tabRow) tabRow.style.display = "none";
    if (activeTab === "custom-elective") {
      activeTab = "y2-ra-b-c";
      // Update active tab styling
      const tabBtns = document.querySelectorAll(".tab-btn");
      tabBtns.forEach(b => {
        if (b.dataset.tab === "y2-ra-b-c") {
          b.classList.add("active");
        } else {
          b.classList.remove("active");
        }
      });
      renderCoursesPool();
    }
  }
}

function renderColorPresets() {
  const container = document.getElementById("custom-color-options");
  if (!container) return;
  container.innerHTML = "";

  PRESET_COLORS.forEach((color, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "color-option-wrapper";
    wrapper.innerHTML = `
      <input type="radio" name="custom-color" id="color-${index}" class="color-option-input" value="${color}" ${index === 0 ? "checked" : ""}>
      <label for="color-${index}" class="color-option-label" style="background-color: ${color};" title="เลือกสีนี้"></label>
    `;
    
    wrapper.querySelector("input").addEventListener("change", (e) => {
      if (e.target.checked) {
        selectedCustomColor = e.target.value;
      }
    });

    container.appendChild(wrapper);
  });
  selectedCustomColor = PRESET_COLORS[0]; // Reset selection to default
}

// Helper to convert date object and time range to Thai BE exam format
function formatExamDateString(dateObj, timeRange) {
  if (!dateObj || !timeRange) return "ไม่มีสอบ";
  
  // Get English day abbreviation
  const days = ["SU", "M", "T", "W", "TH", "F", "SA"];
  const dayAbbrev = days[dateObj.getDay()];
  
  const d = String(dateObj.getDate()).padStart(2, '0');
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const yBE = dateObj.getFullYear() + 543; // Convert to Buddhist Era (BE)
  
  return `${dayAbbrev} ${d}/${m}/${yBE} ${timeRange}`;
}

function addCustomCourseFromForm() {
  const code = document.getElementById("custom-code").value.trim();
  const name = document.getElementById("custom-name").value.trim();
  const section = document.getElementById("custom-section").value.trim();
  const credits = Number(document.getElementById("custom-credits").value);
  const instructor = document.getElementById("custom-instructor").value.trim();
  const day = document.getElementById("custom-day").value;
  const startTime = document.getElementById("custom-start-time").value;
  const endTime = document.getElementById("custom-end-time").value;
  const slotType = document.getElementById("custom-slot-type").value;
  
  // Parse exam dates from Flatpickr
  const midtermDateArr = window.midtermFlatpickr ? window.midtermFlatpickr.selectedDates : [];
  const midtermTime = document.getElementById("custom-midterm-time").value;
  const midtermStr = midtermDateArr.length > 0 && midtermTime 
    ? formatExamDateString(midtermDateArr[0], midtermTime)
    : "ไม่มีสอบ";

  const finalDateArr = window.finalFlatpickr ? window.finalFlatpickr.selectedDates : [];
  const finalTime = document.getElementById("custom-final-time").value;
  const finalStr = finalDateArr.length > 0 && finalTime 
    ? formatExamDateString(finalDateArr[0], finalTime)
    : "ไม่มีสอบ";

  // Prepend "Sec " if the section input is just a number
  let sectionFormatted = section;
  if (sectionFormatted && !sectionFormatted.toLowerCase().startsWith("sec")) {
    sectionFormatted = "Sec " + sectionFormatted;
  }

  // Create course object (Room is removed from inputs, defaulting to "ไม่ระบุ")
  const newCourse = {
    id: "custom-elective-" + Date.now(),
    code: code,
    name: name,
    credits: credits,
    section: sectionFormatted,
    instructor: instructor || "ไม่ระบุ",
    room: "ไม่ระบุ",
    slots: [{ day: day, startTime: startTime, endTime: endTime, type: slotType }],
    midterm: midtermStr,
    final: finalStr,
    color: selectedCustomColor,
    tabId: "custom-elective"
  };

  // Add to state and save
  customCourses.push(newCourse);
  localStorage.setItem("gemini_custom_courses", JSON.stringify(customCourses));
  COURSE_DATABASE["custom-elective"] = customCourses;

  // Make sure tab button is shown
  updateCustomTabVisibility();

  // Switch to the newly created tab automatically
  activeTab = "custom-elective";
  
  // Highlight active class on tabs
  const tabBtns = document.querySelectorAll(".tab-btn");
  tabBtns.forEach(b => {
    if (b.dataset.tab === "custom-elective") {
      b.classList.add("active");
    } else {
      b.classList.remove("active");
    }
  });

  // Re-render
  renderCoursesPool();
}

function deleteCustomCourse(courseId) {
  if (confirm("คุณต้องการลบวิชาเสรีนี้ออกจากรายการวิชาเพิ่มเติมใช่หรือไม่?")) {
    // If currently scheduled, remove it
    if (selectedCourses.some(c => c.id === courseId)) {
      selectedCourses = selectedCourses.filter(c => c.id !== courseId);
      saveState();
      renderSchedule();
      renderDetailsTable();
    }

    // Remove from custom list
    customCourses = customCourses.filter(c => c.id !== courseId);
    localStorage.setItem("gemini_custom_courses", JSON.stringify(customCourses));
    COURSE_DATABASE["custom-elective"] = customCourses;

    // Check visibility and pool
    updateCustomTabVisibility();
    renderCoursesPool();
    highlightConflicts();
  }
}
