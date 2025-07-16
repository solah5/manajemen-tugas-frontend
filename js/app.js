const { createApp } = Vue;

createApp({
  // =================================================================
  // DATA: State Management Aplikasi
  // =================================================================
  data() {
    return {
      // --- State Tampilan & Autentikasi ---
      currentView: "notes", // Mengontrol tampilan/komponen mana yang aktif (cth: 'notes', 'login', 'adminUsers')
      isAuthenticated: false, // Status login pengguna, true jika sudah login
      isAdmin: false, // Status admin, true jika pengguna adalah admin
      authTab: "login", // Tab aktif di halaman autentikasi ('login' atau 'register')
      token: null, // Menyimpan token JWT setelah login untuk otorisasi API

      // --- Data Utama Aplikasi ---
      notes: [], // Menyimpan daftar tugas/catatan milik pengguna yang sedang login
      allUsers: [], // [Admin] Menyimpan daftar semua pengguna (hanya untuk admin)
      allTasks: [], // [Admin] Menyimpan daftar semua tugas dari semua pengguna (hanya untuk admin)
      selectedUser: { id: null, username: '' }, // [Admin] Menyimpan data pengguna yang dipilih untuk dilihat detail tugasnya
      selectedUserTasks: [], // [Admin] Menyimpan tugas dari pengguna yang dipilih

      // --- Opsi & Filter ---
      statusOptions: ["pending", "in progress", "completed"], // Opsi status yang tersedia untuk tugas
      selectedTag: "all", // Tag yang saat ini dipilih untuk memfilter tugas
      availableTags: [], // Daftar semua tag unik yang ada dari semua tugas pengguna
      filteredNotes: [], // Hasil filter tugas berdasarkan tag atau kriteria lain

      // --- State Fitur Chatbot ---
      chatbotOpen: false, // Status untuk membuka/menutup jendela chatbot
      chatMessages: [ // Riwayat percakapan di chatbot
        {
          text: "Hello! I'm your task assistant. Try asking: 'What's due today?' or 'How many tasks are pending?'",
          type: "bot",
        },
      ],
      userMessage: "", // Pesan yang diketik oleh pengguna di input chatbot

      // --- State untuk Form ---
      loginForm: {
        username: "",
        password: "",
      },
      registerForm: {
        username: "",
        password: "",
      },
      noteForm: { // Form untuk menambah atau mengedit tugas
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
  /**
   * Dijalankan saat instance Vue dibuat.
   * Berguna untuk inisialisasi awal, seperti memeriksa sesi login dari localStorage.
   */
  created() {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role"); // Ambil role dari localStorage

    if (token) {
      // Jika token ditemukan, set state aplikasi sebagai sudah terautentikasi
      this.token = token;
      this.isAuthenticated = true;
      this.isAdmin = role === 'admin'; // Set status admin berdasarkan role
      this.fetchNotes(); // Ambil data tugas pengguna
      this.currentView = "notes"; // Arahkan ke halaman utama (daftar tugas)

      // Set interval untuk memeriksa deadline setiap jam
      this.deadlineCheckInterval = setInterval(() => {
        if (this.isAuthenticated) {
          this.checkDeadlines();
        }
      }, 3600000); // 3600000 ms = 1 jam
    } else {
      // Jika tidak ada token, arahkan ke halaman login
      this.currentView = "login";
    }
  },

  // =================================================================
  // METHODS: Logika & Fungsi Aplikasi
  // =================================================================
  methods: {
    // --- Metode Autentikasi & Sesi ---

    /**
     * Mengambil daftar tugas (notes) milik pengguna dari server.
     */
    async fetchNotes() {
      try {
        const response = await axios.get("/notes", {
          headers: { Authorization: `Bearer ${this.token}` },
        });
        this.notes = response.data.data.notes;
        this.filteredNotes = this.notes; // Inisialisasi daftar filter dengan semua tugas
        this.extractTags(); // Ekstrak semua tag yang ada
        this.checkDeadlines(); // Periksa deadline saat data dimuat
      } catch (error) {
        console.error("Error fetching notes:", error);
        // Jika token tidak valid (401), otomatis logout
        if (error.response && error.response.status === 401) {
          this.logout();
        }
      }
    },

    /**
     * Mengirim data login ke server dan mengelola sesi.
     */
    async login() {
      try {
        const response = await axios.post("/login", this.loginForm);
        // Simpan token dan role ke state dan localStorage
        this.token = response.data.data.token;
        this.isAdmin = response.data.data.role === 'admin';
        localStorage.setItem("token", this.token);
        localStorage.setItem("role", response.data.data.role);

        this.isAuthenticated = true;
        this.fetchNotes();
        this.currentView = "notes"; // Arahkan ke halaman tugas setelah login
        this.loginForm = { username: "", password: "" }; // Reset form
      } catch (error) {
        alert("Login gagal. Periksa kembali username dan password Anda.");
        console.error("Login error:", error);
      }
    },

    /**
     * Mengirim data registrasi pengguna baru ke server.
     */
    async register() {
      try {
        await axios.post("/register", this.registerForm);
        alert("Registrasi berhasil. Silakan login.");
        this.authTab = "login"; // Pindah ke tab login
        this.registerForm = { username: "", password: "" }; // Reset form
      } catch (error) {
        if (error.response && error.response.data.message === "Username already exists") {
          alert("Username sudah digunakan. Silakan pilih yang lain.");
        } else {
          alert("Registrasi gagal. Silakan coba lagi.");
        }
        console.error("Registration error:", error);
      }
    },

    /**
     * Mengakhiri sesi pengguna (logout).
     */
    logout() {
      // Hapus token dan role dari localStorage
      localStorage.removeItem("token");
      localStorage.removeItem("role");
      // Reset semua state terkait sesi ke nilai default
      this.token = null;
      this.isAuthenticated = false;
      this.isAdmin = false;
      this.notes = [];
      this.allUsers = [];
      this.allTasks = [];
      this.currentView = "login";
    },

    // --- Metode CRUD untuk Tugas (Notes) ---

    /**
     * Menambahkan tugas baru.
     */
    async addNote() {
      try {
        await axios.post("/notes", this.noteForm, {
          headers: { Authorization: `Bearer ${this.token}` },
        });
        this.fetchNotes(); // Muat ulang data tugas
        this.showNotes(); // Kembali ke tampilan daftar tugas
        this.resetNoteForm(); // Kosongkan form
      } catch (error) {
        console.error("Error adding note:", error);
        alert("Gagal menambahkan tugas.");
      }
    },

    /**
     * Memperbarui tugas yang sudah ada.
     */
    async updateNote() {
      try {
        await axios.put(`/notes/${this.noteForm.id}`, this.noteForm, {
          headers: { Authorization: `Bearer ${this.token}` },
        });
        this.fetchNotes();
        this.showNotes();
        this.resetNoteForm();
      } catch (error) {
        console.error("Error updating note:", error);
        alert("Gagal memperbarui tugas.");
      }
    },

    /**
     * Menghapus tugas berdasarkan ID.
     */
    async deleteNote(id) {
      if (confirm("Apakah Anda yakin ingin menghapus tugas ini?")) {
        try {
          await axios.delete(`/notes/${id}`, {
            headers: { Authorization: `Bearer ${this.token}` },
          });
          this.fetchNotes(); // Muat ulang data setelah hapus
        } catch (error) {
          console.error("Error deleting note:", error);
          alert("Gagal menghapus tugas.");
        }
      }
    },

    // --- Metode UI & Form Helper ---

    /**
     * Mengisi form edit dengan data dari tugas yang dipilih.
     */
    editNote(note) {
      this.noteForm = {
        id: note.id,
        title: note.title,
        tags: note.tags,
        body: note.body,
        status: note.status,
        deadline: note.deadline ? note.deadline.slice(0, 16) : "", // Format untuk input datetime-local
      };
      this.currentView = "editNote"; // Pindah ke tampilan form edit
    },

    /**
     * Mengosongkan state form tugas.
     */
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

    /**
     * Menampilkan halaman daftar tugas.
     */
    showNotes() {
      this.currentView = "notes";
      this.fetchNotes();
    },

    /**
     * Menampilkan halaman form tambah tugas.
     */
    showAddNote() {
      this.resetNoteForm();
      this.currentView = "addNote";
    },

    // --- Metode Utilitas & Pemformatan ---

    /**
     * Memformat string tanggal menjadi format yang mudah dibaca (e.g., "Jul 16, 2025").
     */
    formatDate(dateString) {
      const options = { year: "numeric", month: "short", day: "numeric" };
      return new Date(dateString).toLocaleDateString(undefined, options);
    },

    /**
     * Memformat string deadline lengkap dengan waktu.
     */
    formatDeadline(deadline) {
      if (!deadline) return "No deadline";
      const options = { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" };
      return new Date(deadline).toLocaleDateString(undefined, options);
    },

    /**
     * Memeriksa apakah sebuah deadline sudah lewat.
     */
    isOverdue(deadline) {
      if (!deadline) return false;
      return new Date(deadline) < new Date();
    },
    
    /**
     * Memeriksa apakah deadline tugas adalah hari ini.
     */
    isDueToday(deadline) {
      if (!deadline) return false;
      const today = new Date().toISOString().slice(0, 10);
      return deadline.slice(0, 10) === today && !this.isOverdue(deadline);
    },

    /**
     * Memberikan teks relatif untuk deadline (e.g., "Due today", "Due tomorrow", "3 days overdue").
     */
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

    /**
     * Memeriksa tugas yang akan jatuh tempo dan memicu notifikasi.
     */
    checkDeadlines() {
      const today = new Date().toISOString().slice(0, 10);
      const tasksDueToday = this.notes.filter((note) => {
        if (!note.deadline) return false;
        return note.deadline.slice(0, 10) === today && note.status !== "completed";
      });

      if (tasksDueToday.length > 0) {
        this.showDeadlineNotification(tasksDueToday);
      }
    },

    /**
     * Meminta izin dan menampilkan notifikasi desktop.
     */
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

    /**
     * Membuat konten notifikasi.
     */
    createNotification(tasks) {
      const taskList = tasks.map((task) => `• ${task.title}`).join("\n");
      const notification = new Notification("📅 Tasks Due Today", {
        body: `You have ${tasks.length} task(s) due today:\n${taskList}`,
        icon: "/path/to/your/icon.png", // Ganti dengan path ikon Anda
      });
      setTimeout(() => notification.close(), 10000); // Tutup notifikasi setelah 10 detik
    },

    /**
     * Membersihkan interval saat komponen dihancurkan untuk mencegah memory leak.
     */
    beforeUnmount() {
      if (this.deadlineCheckInterval) {
        clearInterval(this.deadlineCheckInterval);
      }
    },

    /**
     * Mengambil semua tag unik dari daftar tugas.
     */
    extractTags() {
      const allTags = new Set();
      this.notes.forEach((note) => {
        if (note.tags) {
          note.tags.split(",").forEach(tag => allTags.add(tag.trim()));
        }
      });
      this.availableTags = ["all", ...allTags]; // Tambahkan 'all' sebagai opsi pertama
    },

    /**
     * Memfilter daftar tugas berdasarkan tag yang dipilih.
     */
    filterByTag(tag) {
      this.selectedTag = tag;
      if (tag === "all") {
        this.filteredNotes = this.notes;
      } else {
        this.filteredNotes = this.notes.filter(
          (note) => note.tags && note.tags.split(",").map((t) => t.trim()).includes(tag)
        );
      }
    },
    
    // --- Metode Chatbot ---

    /**
     * Membuka atau menutup jendela chatbot.
     */
    toggleChatbot() {
      this.chatbotOpen = !this.chatbotOpen;
    },

    /**
     * Mengirim pesan dari pengguna dan memicu respons bot.
     */
    sendChatMessage() {
      if (!this.userMessage.trim()) return;
      this.chatMessages.push({ text: this.userMessage, type: "user" });
      const userInput = this.userMessage.toLowerCase();
      this.userMessage = "";

      // Tampilkan respons bot dengan sedikit jeda
      setTimeout(() => {
        let response = this.generateBotResponse(userInput);
        this.chatMessages.push({ text: response, type: "bot" });
      }, 500);
    },

    /**
     * Logika utama untuk menghasilkan respons bot berdasarkan input pengguna.
     */
    generateBotResponse(input) {
      input = input.toLowerCase().trim();

      // Pola 1: Ringkasan beban kerja
      if (input.match(/(summary|workload|overview)/)) {
        return this.getWorkloadSummary();
      }

      // Pola 2: Pertanyaan status tugas
      const statusMatch = input.match(/(how many|what|show).*(pending|in progress|completed|overdue)/i);
      if (statusMatch) {
        const statusPhrase = statusMatch[2];
        let statusFilter = statusPhrase.includes("progress") ? "in progress" : statusPhrase;
        const tasks = (statusFilter === "overdue")
            ? this.notes.filter(note => this.isOverdue(note.deadline))
            : this.notes.filter(note => note.status === statusFilter);
        
        if (tasks.length === 0) return `You have no ${statusPhrase} tasks.`;
        return `You have ${tasks.length} ${statusPhrase} tasks:\n${tasks.slice(0, 5).map(t => `• ${t.title}`).join("\n")}${tasks.length > 5 ? `\n...and ${tasks.length - 5} more` : ""}`;
      }

      // Pola 3: Pertanyaan berdasarkan tanggal
      const dateMatch = input.match(/(today|tomorrow|this week|next week)/i);
      if (dateMatch) {
        const period = dateMatch[1].toLowerCase();
        const dateRange = this.parseNaturalDate(period);
        if (!dateRange) return "Saya tidak mengerti periode waktu tersebut.";
        const tasks = this.notes.filter(note => {
          if (!note.deadline) return false;
          const taskDate = new Date(note.deadline);
          taskDate.setHours(0, 0, 0, 0);
          return taskDate >= dateRange.start && taskDate <= dateRange.end;
        });
        return tasks.length
          ? `Tugas yang jatuh tempo ${period}:\n${tasks.map(t => `• ${t.title} (${this.formatDate(t.deadline)})`).join("\n")}`
          : `Tidak ada tugas yang jatuh tempo ${period}.`;
      }
      
      // Pola 4: Pencarian tugas
      const taskSearch = input.match(/(find|search).*("(.+?)"|'(.+?)'|(.+))/);
      if (taskSearch) {
        const keyword = (taskSearch[3] || taskSearch[4] || taskSearch[5]).trim();
        if (!keyword) return "Sebutkan apa yang ingin dicari.";
        const results = this.notes.filter(note => 
          note.title.toLowerCase().includes(keyword) || 
          (note.tags && note.tags.toLowerCase().includes(keyword)) ||
          note.body.toLowerCase().includes(keyword)
        );
        return results.length
          ? `Ditemukan ${results.length} tugas:\n${results.map(t => `• ${t.title} (${t.status})`).join("\n")}`
          : `Tidak ada tugas yang cocok dengan "${keyword}".`;
      }

      // Pola 5: Bantuan
      if (input.includes("help") || input.includes("what can you do")) {
        return `Saya bisa membantu dengan:\n • Status tugas: "Show pending tasks"\n • Tanggal jatuh tempo: "What's due tomorrow?"\n • Pencarian: "Find tasks about 'design'"\n • Beban kerja: "Give me a summary"`;
      }

      // Respons default jika tidak ada pola yang cocok
      return "I'm your task assistant! Try asking:\n" + "• 'What's due today?'\n" + "• 'Show me overdue tasks'\n" + "• 'Find tasks about database'";
    },

    /**
     * Menghasilkan ringkasan jumlah tugas berdasarkan status.
     */
    getWorkloadSummary() {
      const pending = this.notes.filter((n) => n.status === "pending").length;
      const inProgress = this.notes.filter((n) => n.status === "in progress").length;
      const overdue = this.notes.filter((n) => this.isOverdue(n.deadline)).length;
      const completed = this.notes.filter((n) => n.status === "completed").length;
      return `📊 Your Workload:\n ⏳ Pending: ${pending} tasks\n 🚧 In Progress: ${inProgress} tasks\n 🔴 Overdue: ${overdue} tasks\n ✅ Completed: ${completed} tasks`;
    },

    /**
     * Menerjemahkan input bahasa alami (seperti "today", "this week") menjadi rentang tanggal.
     */
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
        end.setDate(end.getDate() + (6 - today.getDay())); // Akhir pekan ini (Sabtu)
        return { start, end };
      }
      if (input.includes("next week")) {
        const start = new Date(today);
        start.setDate(start.getDate() + (7 - today.getDay())); // Mulai dari hari Minggu depan
        const end = new Date(start);
        end.setDate(end.getDate() + 6); // Sampai hari Sabtu berikutnya
        return { start, end };
      }
      return null;
    },

    // --- Metode Khusus Admin ---

    /**
     * [Admin] Mengambil daftar semua pengguna dari server.
     */
    async fetchAllUsers() {
      if (!this.isAdmin) return; // Pemeriksaan keamanan
      try {
        const response = await axios.get("/admin/users", {
          headers: { Authorization: `Bearer ${this.token}` },
        });
        this.allUsers = response.data.data.users;
      } catch (error) {
        console.error("Error fetching all users:", error);
        alert("Gagal mengambil data semua pengguna.");
        if (error.response && error.response.status === 403) this.logout(); // Logout jika tidak diizinkan
      }
    },

    /**
     * [Admin] Mengambil daftar semua tugas dari semua pengguna.
     */
    async fetchAllTasks() {
      if (!this.isAdmin) return;
      try {
        const response = await axios.get("/admin/tasks", {
          headers: { Authorization: `Bearer ${this.token}` },
        });
        this.allTasks = response.data.data.notes;
      } catch (error) {
        console.error("Error fetching all tasks:", error);
        alert("Gagal mengambil data semua tugas.");
        if (error.response && error.response.status === 403) this.logout();
      }
    },
    
    /**
     * [Admin] Menampilkan tugas milik pengguna tertentu.
     */
    async viewUserTasks(userId, username) {
      if (!this.isAdmin) return;
      try {
        // Pastikan data semua tugas sudah ada sebelum memfilter
        if (this.allTasks.length === 0) {
          await this.fetchAllTasks();
        }
        this.selectedUserTasks = this.allTasks.filter(task => task.userId === userId);
        this.selectedUser = { id: userId, username: username };
        this.currentView = "adminUserTasks"; // Pindah ke view tugas pengguna
      } catch (error) {
        console.error("Error fetching user's tasks:", error);
        alert("Gagal mengambil tugas pengguna.");
      }
    },
    
    /**
     * [Admin] Menampilkan halaman daftar semua pengguna.
     */
    showAdminUsers() {
      if (!this.isAdmin) return;
      this.currentView = "adminUsers";
      this.fetchAllUsers();
      this.fetchAllTasks(); // Panggil juga fetchAllTasks agar data siap saat admin klik "View Tasks"
    },
    
    /**
     * [Admin] Menampilkan halaman daftar semua tugas.
     */
    showAdminTasks() {
      if (!this.isAdmin) return;
      this.currentView = "adminTasks";
      this.fetchAllTasks();
    },

  },
}).mount("#app");