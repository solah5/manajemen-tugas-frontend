const { createApp } = Vue;

// GANTI DENGAN URL RAILWAY ANDA JIKA BERBEDA
const API_BASE_URL = "https://manajemen-tugas-production-847d.up.railway.app";

createApp({
  // =================================================================
  // DATA: State Management Aplikasi
  // =================================================================
  data() {
    return {
      // --- State Tampilan & Autentikasi ---
      currentView: "landing",
      isAuthenticated: false,
      isAdmin: false,
      authTab: "login",
      token: null,

      // --- Data Utama Aplikasi ---
      notes: [],
      allUsers: [],
      allTasks: [],
      selectedUser: { id: null, username: "" },
      selectedUserTasks: [],

      // --- Opsi & Filter ---
      statusOptions: ["pending", "in progress", "completed"],
      selectedTag: "all",
      availableTags: [],
      filteredNotes: [],

      // --- State Fitur Chatbot ---
      chatbotOpen: false,
      chatMessages: [
        {
          text: "Hello! I'm your task assistant. Try asking: 'What's due today?' or 'How many tasks are pending?'",
          type: "bot",
        },
      ],
      userMessage: "",

      // --- State untuk Form ---
      loginForm: {
        username: "",
        password: "",
      },
      registerForm: {
        username: "",
        password: "",
      },
      noteForm: {
        id: null,
        title: "",
        tags: "",
        body: "",
        status: "pending",
        deadline: "",
      },
    };
  },

  // =================================================================
  // CREATED: Lifecycle Hook
  // =================================================================
  created() {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");

    if (token) {
      this.token = token;
      this.isAuthenticated = true;
      this.isAdmin = role === "admin";
      this.fetchNotes();
      this.currentView = "notes";

      this.deadlineCheckInterval = setInterval(() => {
        if (this.isAuthenticated) {
          this.checkDeadlines();
        }
      }, 3600000);
    } else {
      this.currentView = "landing";
    }
  },

  // =================================================================
  // METHODS: Logika & Fungsi Aplikasi
  // =================================================================
  methods: {
    // --- Metode Autentikasi & Sesi ---
    async fetchNotes() {
      try {
        const response = await axios.get(`${API_BASE_URL}/notes`, {
          headers: { Authorization: `Bearer ${this.token}` },
        });
        this.notes = response.data.data.notes;
        this.filteredNotes = this.notes;
        this.extractTags();
        this.checkDeadlines();
      } catch (error) {
        console.error("Error fetching notes:", error);
        if (error.response && error.response.status === 401) {
          this.logout();
        }
      }
    },

    showLogin() {
      this.currentView = "login";
    },

    async login() {
      try {
        const response = await axios.post(
          `${API_BASE_URL}/login`,
          this.loginForm
        );
        this.token = response.data.data.token;
        this.isAdmin = response.data.data.role === "admin";
        localStorage.setItem("token", this.token);
        localStorage.setItem("role", response.data.data.role);

        this.isAuthenticated = true;
        this.fetchNotes();
        this.currentView = "notes";
        this.loginForm = { username: "", password: "" };
      } catch (error) {
        alert("Login gagal. Periksa kembali username dan password Anda.");
        console.error("Login error:", error);
      }
    },

    async register() {
      try {
        await axios.post(`${API_BASE_URL}/register`, this.registerForm);
        alert("Registrasi berhasil. Silakan login.");
        this.authTab = "login";
        this.registerForm = { username: "", password: "" };
      } catch (error) {
        if (
          error.response &&
          error.response.data.message === "Username already exists"
        ) {
          alert("Username sudah digunakan. Silakan pilih yang lain.");
        } else {
          alert("Registrasi gagal. Silakan coba lagi.");
        }
        console.error("Registration error:", error);
      }
    },

    logout() {
      localStorage.removeItem("token");
      localStorage.removeItem("role");
      this.token = null;
      this.isAuthenticated = false;
      this.isAdmin = false;
      this.notes = [];
      this.allUsers = [];
      this.allTasks = [];
      this.currentView = "login";
    },

    // --- Metode CRUD untuk Tugas (Notes) ---
    async addNote() {
      try {
        await axios.post(`${API_BASE_URL}/notes`, this.noteForm, {
          headers: { Authorization: `Bearer ${this.token}` },
        });
        this.fetchNotes();
        this.showNotes();
        this.resetNoteForm();
      } catch (error) {
        console.error("Error adding note:", error);
        alert("Gagal menambahkan tugas.");
      }
    },

    async updateNote() {
      try {
        await axios.put(
          `${API_BASE_URL}/notes/${this.noteForm.id}`,
          this.noteForm,
          {
            headers: { Authorization: `Bearer ${this.token}` },
          }
        );
        this.fetchNotes();
        this.showNotes();
        this.resetNoteForm();
      } catch (error) {
        console.error("Error updating note:", error);
        alert("Gagal memperbarui tugas.");
      }
    },

    async deleteNote(id) {
      if (confirm("Apakah Anda yakin ingin menghapus tugas ini?")) {
        try {
          await axios.delete(`${API_BASE_URL}/notes/${id}`, {
            headers: { Authorization: `Bearer ${this.token}` },
          });
          this.fetchNotes();
        } catch (error) {
          console.error("Error deleting note:", error);
          alert("Gagal menghapus tugas.");
        }
      }
    },

    // --- Metode UI & Form Helper ---
    editNote(note) {
      this.noteForm = {
        id: note.id,
        title: note.title,
        tags: note.tags,
        body: note.body,
        status: note.status,
        deadline: note.deadline ? note.deadline.slice(0, 16) : "",
      };
      this.currentView = "editNote";
    },

    resetNoteForm() {
      this.noteForm = {
        id: null,
        title: "",
        tags: "",
        body: "",
        status: "pending",
        deadline: "",
      };
    },

    showNotes() {
      this.currentView = "notes";
      this.fetchNotes();
    },

    showAddNote() {
      this.resetNoteForm();
      this.currentView = "addNote";
    },

    // --- Metode Utilitas & Pemformatan ---
    formatDate(dateString) {
      const options = { year: "numeric", month: "short", day: "numeric" };
      return new Date(dateString).toLocaleDateString(undefined, options);
    },

    formatDeadline(deadline) {
      if (!deadline) return "No deadline";
      const options = {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      };
      return new Date(deadline).toLocaleDateString(undefined, options);
    },

    isOverdue(deadline) {
      if (!deadline) return false;
      return new Date(deadline) < new Date();
    },

    isDueToday(deadline) {
      if (!deadline) return false;
      const today = new Date().toISOString().slice(0, 10);
      return deadline.slice(0, 10) === today && !this.isOverdue(deadline);
    },

    formatRelativeDeadline(deadline) {
      if (!deadline) return "No deadline";
      const now = new Date();
      const dueDate = new Date(deadline);
      const diffDays = Math.floor((dueDate - now) / (1000 * 60 * 60 * 24));

      if (this.isDueToday(deadline)) return "Due today";
      if (diffDays === 1) return "Due tomorrow";
      if (diffDays === -1) return "Due yesterday";
      if (diffDays < 0) return `${Math.abs(diffDays)} days overdue`;
      return `Due in ${diffDays} days`;
    },

    // --- Notifikasi & Filter ---
    checkDeadlines() {
      const today = new Date().toISOString().slice(0, 10);
      const tasksDueToday = this.notes.filter((note) => {
        if (!note.deadline) return false;
        return (
          note.deadline.slice(0, 10) === today && note.status !== "completed"
        );
      });

      if (tasksDueToday.length > 0) {
        this.showDeadlineNotification(tasksDueToday);
      }
    },

    showDeadlineNotification(tasks) {
      if (!("Notification" in window)) {
        console.log("Browser ini tidak mendukung notifikasi desktop.");
        return;
      }
      if (Notification.permission !== "granted") {
        Notification.requestPermission().then((permission) => {
          if (permission === "granted") this.createNotification(tasks);
        });
      } else {
        this.createNotification(tasks);
      }
    },

    createNotification(tasks) {
      const taskList = tasks.map((task) => `• ${task.title}`).join("\n");
      const notification = new Notification("📅 Tasks Due Today", {
        body: `You have ${tasks.length} task(s) due today:\n${taskList}`,
        icon: "/path/to/your/icon.png",
      });
      setTimeout(() => notification.close(), 10000);
    },

    beforeUnmount() {
      if (this.deadlineCheckInterval) {
        clearInterval(this.deadlineCheckInterval);
      }
    },

    extractTags() {
      const allTags = new Set();
      this.notes.forEach((note) => {
        if (note.tags) {
          note.tags.split(",").forEach((tag) => allTags.add(tag.trim()));
        }
      });
      this.availableTags = ["all", ...allTags];
    },

    filterByTag(tag) {
      this.selectedTag = tag;
      if (tag === "all") {
        this.filteredNotes = this.notes;
      } else {
        this.filteredNotes = this.notes.filter(
          (note) =>
            note.tags &&
            note.tags
              .split(",")
              .map((t) => t.trim())
              .includes(tag)
        );
      }
    },

    // --- Metode Chatbot ---
    toggleChatbot() {
      this.chatbotOpen = !this.chatbotOpen;
    },

    sendChatMessage() {
      if (!this.userMessage.trim()) return;
      this.chatMessages.push({ text: this.userMessage, type: "user" });
      const userInput = this.userMessage.toLowerCase();
      this.userMessage = "";

      setTimeout(() => {
        let response = this.generateBotResponse(userInput);
        this.chatMessages.push({ text: response, type: "bot" });
      }, 500);
    },

    generateBotResponse(input) {
      input = input.toLowerCase().trim();

      if (input.match(/(summary|workload|overview)/)) {
        return this.getWorkloadSummary();
      }

      const statusMatch = input.match(
        /(how many|what|show).*(pending|in progress|completed|overdue)/i
      );
      if (statusMatch) {
        const statusPhrase = statusMatch[2];
        let statusFilter = statusPhrase.includes("progress")
          ? "in progress"
          : statusPhrase;
        const tasks =
          statusFilter === "overdue"
            ? this.notes.filter((note) => this.isOverdue(note.deadline))
            : this.notes.filter((note) => note.status === statusFilter);

        if (tasks.length === 0) return `You have no ${statusPhrase} tasks.`;
        return `You have ${tasks.length} ${statusPhrase} tasks:\n${tasks
          .slice(0, 5)
          .map((t) => `• ${t.title}`)
          .join("\n")}${
          tasks.length > 5 ? `\n...and ${tasks.length - 5} more` : ""
        }`;
      }

      const dateMatch = input.match(/(today|tomorrow|this week|next week)/i);
      if (dateMatch) {
        const period = dateMatch[1].toLowerCase();
        const dateRange = this.parseNaturalDate(period);
        if (!dateRange) return "Saya tidak mengerti periode waktu tersebut.";
        const tasks = this.notes.filter((note) => {
          if (!note.deadline) return false;
          const taskDate = new Date(note.deadline);
          taskDate.setHours(0, 0, 0, 0);
          return taskDate >= dateRange.start && taskDate <= dateRange.end;
        });
        return tasks.length
          ? `Tugas yang jatuh tempo ${period}:\n${tasks
              .map((t) => `• ${t.title} (${this.formatDate(t.deadline)})`)
              .join("\n")}`
          : `Tidak ada tugas yang jatuh tempo ${period}.`;
      }

      const taskSearch = input.match(/(find|search).*("(.+?)"|'(.+?)'|(.+))/);
      if (taskSearch) {
        const keyword = (
          taskSearch[3] ||
          taskSearch[4] ||
          taskSearch[5]
        ).trim();
        if (!keyword) return "Sebutkan apa yang ingin dicari.";
        const results = this.notes.filter(
          (note) =>
            note.title.toLowerCase().includes(keyword) ||
            (note.tags && note.tags.toLowerCase().includes(keyword)) ||
            note.body.toLowerCase().includes(keyword)
        );
        return results.length
          ? `Ditemukan ${results.length} tugas:\n${results
              .map((t) => `• ${t.title} (${t.status})`)
              .join("\n")}`
          : `Tidak ada tugas yang cocok dengan "${keyword}".`;
      }

      if (input.includes("help") || input.includes("what can you do")) {
        return `Saya bisa membantu dengan:\n • Status tugas: "Show pending tasks"\n • Tanggal jatuh tempo: "What's due tomorrow?"\n • Pencarian: "Find tasks about 'design'"\n • Beban kerja: "Give me a summary"`;
      }

      return (
        "I'm your task assistant! Try asking:\n" +
        "• 'What's due today?'\n" +
        "• 'Show me overdue tasks'\n" +
        "• 'Find tasks about database'"
      );
    },

    getWorkloadSummary() {
      const pending = this.notes.filter((n) => n.status === "pending").length;
      const inProgress = this.notes.filter(
        (n) => n.status === "in progress"
      ).length;
      const overdue = this.notes.filter((n) =>
        this.isOverdue(n.deadline)
      ).length;
      const completed = this.notes.filter(
        (n) => n.status === "completed"
      ).length;
      return `📊 Your Workload:\n ⏳ Pending: ${pending} tasks\n 🚧 In Progress: ${inProgress} tasks\n 🔴 Overdue: ${overdue} tasks\n ✅ Completed: ${completed} tasks`;
    },

    parseNaturalDate(input) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (input.includes("today")) return { start: today, end: today };
      if (input.includes("tomorrow")) {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return { start: tomorrow, end: tomorrow };
      }
      if (input.includes("this week")) {
        const start = new Date(today);
        const end = new Date(today);
        end.setDate(end.getDate() + (6 - today.getDay()));
        return { start, end };
      }
      if (input.includes("next week")) {
        const start = new Date(today);
        start.setDate(start.getDate() + (7 - today.getDay()));
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        return { start, end };
      }
      return null;
    },

    // --- Metode Khusus Admin ---
    async fetchAllUsers() {
      if (!this.isAdmin) return;
      try {
        const response = await axios.get(`${API_BASE_URL}/admin/users`, {
          headers: { Authorization: `Bearer ${this.token}` },
        });
        this.allUsers = response.data.data.users;
      } catch (error) {
        console.error("Error fetching all users:", error);
        alert("Gagal mengambil data semua pengguna.");
        if (error.response && error.response.status === 403) this.logout();
      }
    },

    async fetchAllTasks() {
      if (!this.isAdmin) return;
      try {
        const response = await axios.get(`${API_BASE_URL}/admin/tasks`, {
          headers: { Authorization: `Bearer ${this.token}` },
        });
        this.allTasks = response.data.data.notes;
      } catch (error) {
        console.error("Error fetching all tasks:", error);
        alert("Gagal mengambil data semua tugas.");
        if (error.response && error.response.status === 403) this.logout();
      }
    },

    async viewUserTasks(userId, username) {
      if (!this.isAdmin) return;
      try {
        if (this.allTasks.length === 0) {
          await this.fetchAllTasks();
        }
        this.selectedUserTasks = this.allTasks.filter(
          (task) => task.userId === userId
        );
        this.selectedUser = { id: userId, username: username };
        this.currentView = "adminUserTasks";
      } catch (error) {
        console.error("Error fetching user's tasks:", error);
        alert("Gagal mengambil tugas pengguna.");
      }
    },

    showAdminUsers() {
      if (!this.isAdmin) return;
      this.currentView = "adminUsers";
      this.fetchAllUsers();
      this.fetchAllTasks();
    },

    showAdminTasks() {
      if (!this.isAdmin) return;
      this.currentView = "adminTasks";
      this.fetchAllTasks();
    },
  },
}).mount("#app");
