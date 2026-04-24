-- =====================================================
-- TẠO CƠ SỞ DỮ LIỆU VÀ BẢNG CHO RESTAURANT QR
-- Chạy toàn bộ script này trong SSMS
-- =====================================================

-- Tạo Database
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'RestaurantQR')
BEGIN
    CREATE DATABASE RestaurantQR;
END
GO

USE RestaurantQR;
GO

-- =====================================================
-- BẢNG MENU
-- =====================================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Menu') AND type in (N'U'))
BEGIN
    CREATE TABLE Menu (
        id INT PRIMARY KEY IDENTITY(1,1),
        name NVARCHAR(255) NOT NULL,
        price INT NOT NULL,
        category NVARCHAR(100),
        image NVARCHAR(255),
        available BIT DEFAULT 1,
        createdAt DATETIME DEFAULT GETDATE(),
        updatedAt DATETIME DEFAULT GETDATE()
    );
END
GO

-- =====================================================
-- BẢNG BÀN
-- =====================================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Tables') AND type in (N'U'))
BEGIN
    CREATE TABLE Tables (
        tableId NVARCHAR(50) PRIMARY KEY,
        tableName NVARCHAR(100) NOT NULL,
        status NVARCHAR(50) DEFAULT 'available',
        currentSession NVARCHAR(100),
        createdAt DATETIME DEFAULT GETDATE(),
        updatedAt DATETIME DEFAULT GETDATE()
    );
END
GO

-- =====================================================
-- BẢNG ĐƠN HÀNG
-- =====================================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Orders') AND type in (N'U'))
BEGIN
    CREATE TABLE Orders (
        orderId NVARCHAR(50) PRIMARY KEY,
        tableId NVARCHAR(50),
        tableName NVARCHAR(100),
        customerName NVARCHAR(100),
        items NVARCHAR(MAX),  -- Lưu JSON array
        note NVARCHAR(500),
        total INT,
        status NVARCHAR(50) DEFAULT 'pending',
        createdAt DATETIME DEFAULT GETDATE(),
        paidAt DATETIME NULL,
        updatedAt DATETIME DEFAULT GETDATE()
    );
END
GO

-- =====================================================
-- THÊM DỮ LIỆU MẪU MENU
-- =====================================================
IF NOT EXISTS (SELECT * FROM Menu)
BEGIN
    INSERT INTO Menu (name, price, category, image, available) VALUES
    (N'Bánh Mì Chả Cá + Tặng Trà Tắc', 17000, N'Món chính', '/menu/banhmichaca.jpg', 1),
    (N'Bánh Mì Chả Cá Trứng + Tặng Trà Tắc', 22000, N'Món chính', '/menu/banhmichatrung.jpg', 1),
    (N'Bánh Mì Chả Cá Chả Lụa + Tặng Trà Tắc', 22000, N'Món chính', '/menu/banhmicalua.jpg', 1),
    (N'Bánh Mì Chả Cá Đặc Biệt + Tặng Trà Tắc', 27000, N'Món chính', '/menu/banhmidacbiet.jpg', 1),
    (N'Trứng Thêm', 5000, N'Thêm', '/menu/trung.png', 1),
    (N'Chả Cá Thêm', 5000, N'Thêm', '/menu/chaca.jpg', 1),
    (N'Chả Lụa Thêm', 5000, N'Thêm', '/menu/images.jpg', 1);
END
GO

-- =====================================================
-- THÊM DỮ LIỆU MẪU BÀN
-- =====================================================
IF NOT EXISTS (SELECT * FROM Tables WHERE tableId = 'takeaway')
BEGIN
    INSERT INTO Tables (tableId, tableName, status) VALUES
    ('takeaway', N'Khách Mang Đi', 'available');
END
GO

-- =====================================================
-- TẠO STORED PROCEDURES
-- =====================================================

-- Get All Menu
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.sp_GetMenu') AND type in (N'P'))
    DROP PROCEDURE sp_GetMenu;
GO

CREATE PROCEDURE sp_GetMenu
AS
BEGIN
    SELECT * FROM Menu WHERE available = 1 ORDER BY category, id;
END
GO

-- Add Order
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.sp_AddOrder') AND type in (N'P'))
    DROP PROCEDURE sp_AddOrder;
GO

CREATE PROCEDURE sp_AddOrder
    @orderId NVARCHAR(50),
    @tableId NVARCHAR(50),
    @tableName NVARCHAR(100),
    @customerName NVARCHAR(100),
    @items NVARCHAR(MAX),
    @note NVARCHAR(500),
    @total INT
AS
BEGIN
    INSERT INTO Orders (orderId, tableId, tableName, customerName, items, note, total, status)
    VALUES (@orderId, @tableId, @tableName, @customerName, @items, @note, @total, 'pending');
END
GO

-- Update Order Status
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.sp_UpdateOrderStatus') AND type in (N'P'))
    DROP PROCEDURE sp_UpdateOrderStatus;
GO

CREATE PROCEDURE sp_UpdateOrderStatus
    @orderId NVARCHAR(50),
    @status NVARCHAR(50)
AS
BEGIN
    UPDATE Orders 
    SET status = @status, updatedAt = GETDATE() 
    WHERE orderId = @orderId;
END
GO

-- Checkout Order
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.sp_CheckoutOrder') AND type in (N'P'))
    DROP PROCEDURE sp_CheckoutOrder;
GO

CREATE PROCEDURE sp_CheckoutOrder
    @orderId NVARCHAR(50)
AS
BEGIN
    UPDATE Orders 
    SET status = 'paid', paidAt = GETDATE(), updatedAt = GETDATE() 
    WHERE orderId = @orderId;
END
GO

-- Get All Orders
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.sp_GetOrders') AND type in (N'P'))
    DROP PROCEDURE sp_GetOrders;
GO

CREATE PROCEDURE sp_GetOrders
AS
BEGIN
    SELECT * FROM Orders ORDER BY createdAt DESC;
END
GO

-- Get Today's Orders
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.sp_GetTodayOrders') AND type in (N'P'))
    DROP PROCEDURE sp_GetTodayOrders;
GO

CREATE PROCEDURE sp_GetTodayOrders
AS
BEGIN
    SELECT * FROM Orders 
    WHERE CAST(createdAt AS DATE) = CAST(GETDATE() AS DATE)
    ORDER BY createdAt DESC;
END
GO

PRINT N' Tạo database và bảng thành công!';