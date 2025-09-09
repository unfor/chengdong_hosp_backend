import express from "express";
import sqlite3 from "sqlite3";
import cors from "cors";

// 启用SQLite3 verbose模式
sqlite3.verbose();
const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// 连接SQLite3数据库文件
const db = new sqlite3.Database("hospital.db", (err) => {
  if (err) {
    console.error("数据库连接失败:", err.message);
  } else {
    console.log("已成功连接到SQLite3数据库");
  }
});

// 初始化数据表结构（使用IF NOT EXISTS避免重复创建，不删除旧表）
const initTables = async () => {
  const tables = [
    {
      name: "admin",
      schema: `CREATE TABLE IF NOT EXISTS admin (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL
      )`,
    },
    {
      name: "hospital_info",
      schema: `CREATE TABLE IF NOT EXISTS hospital_info (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        introduction TEXT,
        address TEXT,
        phone TEXT,
        emergencyPhone TEXT,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL
      )`,
    },
    {
      name: "staff",
      schema: `CREATE TABLE IF NOT EXISTS staff (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        department TEXT NOT NULL,
        position TEXT,
        status TEXT DEFAULT 'active',
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL
      )`,
    },
    {
      name: "duty",
      schema: `CREATE TABLE IF NOT EXISTS duty (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        staff_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        shift TEXT NOT NULL,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        FOREIGN KEY (staff_id) REFERENCES staff(id)
      )`,
    },
  ];

  for (const table of tables) {
    try {
      // 直接创建表（如果不存在）
      await new Promise((resolve, reject) => {
        db.run(table.schema, (err) => {
          if (err) {
            console.error(`创建${table.name}表失败:`, err.message);
            reject(err);
          } else {
            console.log(`${table.name}表已准备就绪`);
            resolve();
          }
        });
      });
    } catch (err) {
      console.error(`处理${table.name}表时出错:`, err);
      throw err; // 传播错误以停止初始化
    }
  }
};

// 初始化默认数据
const initDefaultData = () => {
  // 检查并创建默认管理员
  db.get("SELECT COUNT(*) as count FROM admin", (err, result) => {
    console.log('found error',err, result)
    if (err) {
      console.error("查询admin表失败:", err.message);
      // 延迟重试查询
      setTimeout(() => initDefaultData(), 1000);
      return;
    }
    if (result.count === 0) {
      const now = new Date().toISOString();
      db.run(
        `INSERT INTO admin (username, password, created_at, updated_at) VALUES (?, ?, ?, ?)`,
        ["admin", "0192023a7bbd73250516f069df18b500", now, now],
        (err) =>
          err
            ? console.error("创建默认管理员失败:", err.message)
            : console.log("默认管理员已创建")
      );
    }
  });

  // 检查并创建默认医院信息
  db.get("SELECT COUNT(*) as count FROM hospital_info", (err, result) => {
    if (err) {
      console.error("查询hospital_info表失败:", err.message);
      // 延迟重试查询
      setTimeout(() => initDefaultData(), 1000);
      return;
    }
    if (result.count === 0) {
      const now = new Date().toISOString();
      db.run(
        `INSERT INTO hospital_info (name, introduction, address, phone, emergencyPhone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          "城东医院",
          "欢迎来到城东医院。我院成立于1997年，是一所综合性三级甲等医院。",
          "城市中心区xx路666号",
          "025-12345678",
          "025-12345679",
          now,
          now,
        ],
        (err) =>
          err
            ? console.error("创建默认医院信息失败:", err.message)
            : console.log("默认医院信息已创建")
      );
    }
  });
};

// 初始化数据库
await initTables();
await initDefaultData();
console.log('数据库初始化完成')

// 数据库操作服务封装
const dbService = {
  // 人员管理
  getAllStaff: (callback) => {
    db.all("SELECT * FROM staff", [], callback);
  },

  // getStaffById: (id, callback) => {
  //   db.get("SELECT * FROM staff WHERE id = ?", [id], callback);
  // },

  // 创建员工
  createStaff: (staffData, callback) => {
    const { name, department, position, status } = staffData;
    const now = new Date().toISOString();
    db.run(
      "INSERT INTO staff (name, department, position, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [name, department, position || "", status || "active", now, now],
      callback
    );
  },

  // 更新员工信息
  updateStaff: (id, staffData, callback) => {
    const { name, department, position, status } = staffData;
    const now = new Date().toISOString();
    db.run(
      "UPDATE staff SET name = ?, department = ?, position = ?, status = ?, updated_at = ? WHERE id = ?",
      [name, department, position, status, now, id],
      callback
    );
  },

  // 删除员工
  deleteStaff: (id, callback) => {
    db.run("DELETE FROM staff WHERE id = ?", [id], callback);
  },

  // 排班查询
  getDutyByDate: (date, callback) => {
    db.all(
      `SELECT s.*, st.name, st.department
       FROM duty s
       LEFT JOIN staff st ON s.staff_id = st.id
       WHERE s.date = ?
       ORDER BY st.department ASC, s.shift ASC`,
      [date],
      callback
    );
  },

  // 排班
  createDuty: (dutyData, callback) => {
    const { staff_id, date, shift } = dutyData;
    db.get(
      "SELECT id FROM duty WHERE staff_id = ? AND date = ? AND shift = ?",
      [staff_id, date, shift],
      (err, row) => {
        if (err || row)
          return callback(
            err || new Error("该人员在指定日期的该班次已存在排班")
          );
        const now = new Date().toISOString();
        db.run(
          "INSERT INTO duty (staff_id, date, shift, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
          [staff_id, date, shift, now, now],
          callback
        );
      }
    );
  },

  // 获取医院信息
  getHospitalInfo: (callback) => {
    db.get("SELECT * FROM hospital_info LIMIT 1", [], callback);
  },

  // 更新医院信息
  updateHospitalInfo: (hospitalData, callback) => {
    const { name, introduction, address, phone, emergencyPhone } = hospitalData;
    const now = new Date().toISOString();
    db.get("SELECT id FROM hospital_info LIMIT 1", [], (err, row) => {
      if (err) return callback(err);
      if (row) {
        db.run(
          "UPDATE hospital_info SET name = ?, introduction = ?, address = ?, phone = ?, emergencyPhone = ?, updated_at = ? WHERE id = ?",
          [name, introduction || "", address || "", phone || "", emergencyPhone || "", now, row.id],
          callback
        );
      } else {
        db.run(
          "INSERT INTO hospital_info (name, introduction, address, phone, emergencyPhone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [name, introduction || "", address || "", phone || "", emergencyPhone || "", now, now],
          callback
        );
      }
    });
  },

  // 管理员认证
  adminLogin: (credentials, callback) => {
    const { username, password } = credentials;
    db.get(
      "SELECT * FROM admin WHERE username = ? AND password = ?",
      [username, password],
      callback
    );
  },

  changeAdminPassword: (passwordData, callback) => {
    const { oldPassword, newPassword } = passwordData;
    db.get("SELECT * FROM admin LIMIT 1", [], (err, row) => {
      if (err) return callback(err);
      if (!row) return callback(new Error("管理员账户不存在"));
      if (row.password !== oldPassword)
        return callback(new Error("原密码不正确"));

      const now = new Date().toISOString();
      db.run(
        "UPDATE admin SET password = ?, updated_at = ? WHERE id = ?",
        [newPassword, now, row.id],
        callback
      );
    });
  },
};

// =========================普通接口=================================

// API路由 - 获取医院信息
app.get("/hospital/query-info", (req, res) => {
  dbService.getHospitalInfo((err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row);
  });
});

// API路由 - 获取所有人员信息
app.get("/staffs/get-all-staffs", (req, res) => {
  dbService.getAllStaff((err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// API路由 - 排班查询
app.get("/staffs/query-duty/:date", (req, res) => {
  dbService.getDutyByDate(req.params.date, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// API路由 - 获取人员信息
// app.get('/staffs/get-staff-info/:id', (req, res) => {
//   dbService.getStaffById(req.params.id, (err, row) => {
//     if (err) return res.status(500).json({ error: err.message });
//     res.json(row);
//   });
// });

// ===================================管理员接口============================
// API路由 - 管理员登录
app.post("/admin/login", (req, res) => {
  dbService.adminLogin(req.body, (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.status(200).json(row || null);
  });
});

// API路由 - 新增人员
app.post("/admin/staffs/add-staff", (req, res) => {
  dbService.createStaff(req.body, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});

// API路由 - 人员更新
app.put("/admin/staffs/update-staff/:id", (req, res) => {
  dbService.updateStaff(req.params.id, req.body, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ changes: this.changes });
  });
});

// API路由 - 人员删除
app.delete("/admin/staffs/delete-staff/:id", (req, res) => {
  dbService.deleteStaff(req.params.id, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ changes: this.changes });
  });
});

// API路由 - 排班
app.post("/admin/arrange-duty", (req, res) => {
  dbService.createDuty(req.body, function (err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});

// API路由 - 医院信息更新
app.put("/admin/hospital/update-info", (req, res) => {
  dbService.updateHospitalInfo(req.body, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ changes: this.changes || this.lastID });
  });
});

// API路由 - 管理员密码更新
app.post("/admin/update-password", (req, res) => {
  dbService.changeAdminPassword(req.body, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    res.status(200).json({ success: true });
  });
});

// 启动服务器
app.listen(port, () => {
  console.log(`后端服务器运行在 http://localhost:${port}`);
});

// 在进程退出时关闭数据库连接
process.on("SIGINT", () => {
  db.close((err) => {
    if (err) console.error("关闭数据库连接失败:", err.message);
    console.log("已关闭数据库连接");
    process.exit(0);
  });
});
