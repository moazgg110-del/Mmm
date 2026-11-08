/* 
    المتاهة المسكونة: الهروب في الظلام
    تم التطوير بواسطة: المبرمج معاذ محمد عبد النبي
    محرك ألعاب 2D متكامل بـ JavaScript خالص
*/

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- حالة اللعبة العامة Game State ---
let currentLevel = 1;
const maxLevels = 200;
let unlockedLevels = 1;
let coins = 0;
let gameLoopId = null;

let gameConfig = {
    volume: 0.8,
    brightness: 1.0,
    theme: 'auto',
    vibrationEnabled: true
};

// --- الأذونات وسيرفر الأجهزة Device Capabilities ---
let permissionsGranted = false;
let mediaStreamTrack = null;

async function requestGamePermissions() {
    // 1. طلب إذن الكاميرا لتشغيل الكشاف
    try {
        if ('mediaDevices' in navigator && 'getUserMedia' in navigator) {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            mediaStreamTrack = stream.getVideoTracks()[0];
        }
    } catch (e) {
        console.log("الكشاف غير مدعوم على المتصفح الحالي أو تم رفض الإذن.");
    }

    // 2. طلب إذن الميكروفون
    try {
        if ('mediaDevices' in navigator && 'getUserMedia' in navigator) {
            await navigator.mediaDevices.getUserMedia({ audio: true });
        }
    } catch (e) {
        console.log("الميكروفون غير مدعوم أو تم رفضه.");
    }

    // 3. طلب حسّاس الحركة والاتجاه (Device Orientation)
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            await DeviceOrientationEvent.requestPermission();
        } catch (e) {
            console.log("حسّاس الحركة لم يفعل.");
        }
    }

    permissionsGranted = true;
    document.getElementById('permissionOverlay').classList.add('hidden');
    document.getElementById('mainMenu').classList.remove('hidden');
    triggerVibration([100, 50, 100]);
}

function triggerVibration(pattern) {
    if (gameConfig.vibrationEnabled && "vibrate" in navigator) {
        navigator.vibrate(pattern);
    }
}

function toggleTorch(enable) {
    if (mediaStreamTrack && mediaStreamTrack.getCapabilities().torch) {
        mediaStreamTrack.applyConstraints({ advanced: [{ torch: enable }] }).catch(e => {});
    }
}

// --- حالة اللاعب Player Data ---
const player = {
    x: 50, y: 300,
    width: 32, height: 48,
    dx: 0, dy: 0,
    speed: 4.5, jumpPower: -11.5,
    isGrounded: false,
    hearts: 3, maxHearts: 5,
    ammo: 15,
    facing: 'right',
    invulnerable: false
};

// عناصر ومصفوفات البيئة
let bullets = [];
let enemies = [];
let platforms = [];
let coinItems = [];
let levelGoal = { x: 820, y: 280, width: 45, height: 70 };
let currentLevelTheme = 'day'; // 'day', 'dark', 'cave', 'rain'

const keys = { left: false, right: false, up: false, shoot: false };

// --- مولّد الـ 200 مرحلة الديناميكي الذكي ---
function generateLevel(levelNum) {
    enemies = [];
    platforms = [];
    bullets = [];
    coinItems = [];
    
    player.x = 50; player.y = 300; player.dx = 0; player.dy = 0;

    // تحديد نمط المرحلة
    if (levelNum % 3 === 0) currentLevelTheme = 'dark'; // مرحلة كشاف وظلام
    else if (levelNum % 5 === 0) currentLevelTheme = 'cave'; // مرحلة كهوف داكنة
    else currentLevelTheme = 'day'; // مرحلة نهارية

    // الأرضية الأساسية
    platforms.push({ x: 0, y: 380, width: 900, height: 70, type: 'ground' });

    // زيادة الصعوبة تدريجياً حسب رقم المرحلة
    let difficultyMultiplier = 1 + (levelNum * 0.02);
    let platformCount = 4 + (levelNum % 4);

    for (let i = 0; i < platformCount; i++) {
        let px = 150 + i * 140;
        let py = 300 - (i % 3) * 60;
        platforms.push({ x: px, y: py, width: 110, height: 20, type: 'floating' });
        
        // إدراج عملات ذهبية
        coinItems.push({ x: px + 40, y: py - 30, width: 16, height: 16, collected: false });
    }

    // توليد الوحوش بأرواح وأنواع مختلفة
    let enemyCount = 2 + Math.floor(levelNum / 10);
    for (let e = 0; e < enemyCount; e++) {
        let ex = 250 + e * 180;
        let ey = 340;
        let isStrong = (e + levelNum) % 2 === 0;

        enemies.push({
            x: ex, y: ey,
            width: isStrong ? 38 : 30,
            height: isStrong ? 42 : 30,
            type: isStrong ? 'orc' : 'slime',
            hp: isStrong ? 2 : 1, // وحوش ضربتين ووحوش ضربة واحدة
            maxHp: isStrong ? 2 : 1,
            speed: (1.2 + (e * 0.2)) * difficultyMultiplier,
            dir: 1,
            range: [ex - 80, ex + 80]
        });
    }

    // التحكم بالكشاف
    if (currentLevelTheme === 'dark') toggleTorch(true);
    else toggleTorch(false);
}

// --- تحديث الفيزياء والتصادمات (Physics & Collision) ---
function update() {
    // الحركة الأفقية
    if (keys.left) { player.dx = -player.speed; player.facing = 'left'; }
    else if (keys.right) { player.dx = player.speed; player.facing = 'right'; }
    else { player.dx = 0; }

    // القفز
    if (keys.up && player.isGrounded) {
        player.dy = player.jumpPower;
        player.isGrounded = false;
        triggerVibration(40);
    }

    // تطبيق الجاذبية
    player.dy += 0.55;
    player.x += player.dx;
    player.y += player.dy;

    // التصادم مع حدود الشاشة
    if (player.x < 0) player.x = 0;
    if (player.x + player.width > canvas.width) player.x = canvas.width - player.width;

    // تصادم المنصات والأرضيات
    player.isGrounded = false;
    platforms.forEach(p => {
        if (player.x < p.x + p.width && player.x + player.width > p.x &&
            player.y + player.height >= p.y && player.y + player.height <= p.y + p.height && player.dy >= 0) {
            player.y = p.y - player.height;
            player.dy = 0;
            player.isGrounded = true;
        }
    });

    // تحديث حركة القذائف
    bullets.forEach((b, index) => {
        b.x += b.speed;
        if (b.x > canvas.width || b.x < 0) bullets.splice(index, 1);
    });

    // جمع العملات الذهبية
    coinItems.forEach(c => {
        if (!c.collected && player.x < c.x + c.width && player.x + player.width > c.x &&
            player.y < c.y + c.height && player.y + player.height > c.y) {
            c.collected = true;
            coins += 5;
            triggerVibration(30);
        }
    });

    // تحديث الوحوش والتصادم (الدهس والضرب)
    enemies.forEach((e, eIdx) => {
        e.x += e.speed * e.dir;
        if (e.x < e.range[0] || e.x > e.range[1]) e.dir *= -1;

        // التصادم مع الرصاص
        bullets.forEach((b, bIdx) => {
            if (b.x > e.x && b.x < e.x + e.width && b.y > e.y && b.y < e.y + e.height) {
                e.hp--;
                bullets.splice(bIdx, 1);
                triggerVibration(60);
                if (e.hp <= 0) enemies.splice(eIdx, 1);
            }
        });

        // التصادم المباشر مع اللاعب
        if (player.x < e.x + e.width && player.x + player.width > e.x &&
            player.y < e.y + e.height && player.y + player.height > e.y) {
            
            // النط على رأس الوحش (Mario Style Jump)
            if (player.dy > 0 && player.y + player.height - player.dy <= e.y + 12) {
                enemies.splice(eIdx, 1);
                player.dy = player.jumpPower * 0.75;
                coins += 10;
                triggerVibration([80, 40, 80]);
            } else if (!player.invulnerable) {
                // تضرر اللاعب
                player.hearts--;
                player.invulnerable = true;
                triggerVibration(300);

                setTimeout(() => { player.invulnerable = false; }, 1200);

                if (player.hearts <= 0) {
                    alert("خسرت كل القلوب! إعادة المرحلة...");
                    player.hearts = 3; player.ammo = 15;
                    generateLevel(currentLevel);
                }
            }
        }
    });

    // الانفصال ونهاية المرحلة (Goal)
    if (player.x < levelGoal.x + levelGoal.width && player.x + player.width > levelGoal.x &&
        player.y < levelGoal.y + levelGoal.height && player.y + player.height > levelGoal.y) {
        
        triggerVibration([100, 100, 200]);
        if (currentLevel >= unlockedLevels) unlockedLevels = Math.min(maxLevels, currentLevel + 1);
        
        document.getElementById('winStats').innerText = `جمعت عملات في هذه المرحلة! رصيدك: ${coins} 🪙`;
        document.getElementById('winMenu').classList.remove('hidden');
        cancelAnimationFrame(gameLoopId);
    }
}

// --- الرسم البصري المحترف (Rendering) ---
function render() {
    ctx.filter = `brightness(${gameConfig.brightness})`;

    // رسم خلفيات المراحل
    if (currentLevelTheme === 'day') ctx.fillStyle = "#70c5ce";
    else if (currentLevelTheme === 'cave') ctx.fillStyle = "#2c3e50";
    else ctx.fillStyle = "#0f0f15";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // رسم الأرضيات والبلاتفورم
    platforms.forEach(p => {
        ctx.fillStyle = p.type === 'ground' ? "#2d3436" : "#e67e22";
        ctx.fillRect(p.x, p.y, p.width, p.height);
        // حافة عشبية
        ctx.fillStyle = "#2ecc71";
        ctx.fillRect(p.x, p.y, p.width, 5);
    });

    // رسم العملات الذهبية
    coinItems.forEach(c => {
        if (!c.collected) {
            ctx.fillStyle = "#f1c40f";
            ctx.beginPath();
            ctx.arc(c.x + 8, c.y + 8, 8, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    // رسم اللاعب (شخصية متناسقة تفصيلية)
    ctx.fillStyle = player.invulnerable ? "rgba(52, 152, 219, 0.5)" : "#3498db";
    ctx.fillRect(player.x, player.y + 14, player.width, player.height - 14);
    // رأس اللاعب
    ctx.fillStyle = "#f1c40f";
    ctx.beginPath();
    ctx.arc(player.x + player.width/2, player.y + 12, 11, 0, Math.PI * 2);
    ctx.fill();

    // عيون حسب الاتجاه
    ctx.fillStyle = "#000";
    let eyeOffset = player.facing === 'right' ? 4 : -4;
    ctx.fillRect(player.x + player.width/2 + eyeOffset, player.y + 9, 3, 3);

    // رسم الوحوش بأشكال حقيقية
    enemies.forEach(e => {
        if (e.type === 'slime') {
            // وحش السلايم الأخضر
            ctx.fillStyle = "#2ecc71";
            ctx.beginPath();
            ctx.arc(e.x + e.width/2, e.y + e.height - 10, 15, Math.PI, 0);
            ctx.fill();
        } else {
            // وحش الأورك الأحمر بقرون وبار صحة
            ctx.fillStyle = "#e74c3c";
            ctx.fillRect(e.x, e.y + 10, e.width, e.height - 10);
            // القرون
            ctx.fillStyle = "#f39c12";
            ctx.beginPath();
            ctx.moveTo(e.x + 5, e.y + 10); ctx.lineTo(e.x, e.y); ctx.lineTo(e.x + 10, e.y + 10);
            ctx.moveTo(e.x + e.width - 5, e.y + 10); ctx.lineTo(e.x + e.width, e.y); ctx.lineTo(e.x + e.width - 10, e.y + 10);
            ctx.fill();

            // شريط صحة الوحش
            ctx.fillStyle = "#000";
            ctx.fillRect(e.x, e.y - 8, e.width, 5);
            ctx.fillStyle = "#2ecc71";
            ctx.fillRect(e.x, e.y - 8, (e.width * (e.hp / e.maxHp)), 5);
        }
    });

    // رسم الرصاص
    ctx.fillStyle = "#f39c12";
    bullets.forEach(b => ctx.fillRect(b.x, b.y, 10, 4));

    // رسم مخرج المرحلة 🚪
    ctx.fillStyle = "#f1c40f";
    ctx.fillRect(levelGoal.x, levelGoal.y, levelGoal.width, levelGoal.height);
    ctx.fillStyle = "#000";
    ctx.font = "bold 14px Tahoma";
    ctx.fillText("خروج 🚪", levelGoal.x + 2, levelGoal.y + 40);

    // تأثير إضاءة الكشاف في المراحل المظلمة 🔦
    if (currentLevelTheme === 'dark' && gameConfig.theme !== 'light') {
        ctx.fillStyle = "rgba(0, 0, 0, 0.93)";
        ctx.beginPath();
        ctx.rect(0, 0, canvas.width, canvas.height);
        ctx.arc(player.x + player.width/2, player.y + player.height/2, 100, 0, Math.PI * 2, true);
        ctx.fill();
    }

    // عرض شريط البيانات HUD (القلوب + الرصاص + العملات)
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px Tahoma";
    ctx.fillText(`المرحلة: ${currentLevel} / ${maxLevels}`, 20, 30);
    ctx.fillText(`القلوب: ${"❤️".repeat(player.hearts)}`, 20, 55);
    ctx.fillText(`الرصاص: ${player.ammo} 🔫`, 20, 80);
    ctx.fillText(`العملات: ${coins} 🪙`, 20, 105);
}

function gameLoop() {
    update();
    render();
    gameLoopId = requestAnimationFrame(gameLoop);
}

// --- إدارات الواجهات والمتاجر ---
function shoot() {
    if (player.ammo > 0) {
        bullets.push({
            x: player.facing === 'right' ? player.x + player.width : player.x - 10,
            y: player.y + 20,
            speed: player.facing === 'right' ? 9 : -9
        });
        player.ammo--;
        triggerVibration(40);
    }
}

function startGame() {
    document.getElementById('mainMenu').classList.add('hidden');
    generateLevel(currentLevel);
    gameLoop();
}

function nextLevel() {
    currentLevel++;
    document.getElementById('winMenu').classList.add('hidden');
    generateLevel(currentLevel);
    gameLoop();
}

function openLevelSelect() {
    const grid = document.getElementById('levelGrid');
    grid.innerHTML = '';
    for (let i = 1; i <= maxLevels; i++) {
        const btn = document.createElement('div');
        btn.className = `level-btn ${i <= unlockedLevels ? '' : 'locked'}`;
        btn.innerText = i;
        if (i <= unlockedLevels) {
            btn.onclick = () => {
                currentLevel = i;
                closeOverlay('levelMenu');
                startGame();
            };
        }
        grid.appendChild(btn);
    }
    document.getElementById('levelMenu').classList.remove('hidden');
}

function openShop() {
    document.getElementById('shopCoins').innerText = coins;
    document.getElementById('shopMenu').classList.remove('hidden');
}

function buyAmmo() {
    if (coins >= 10) { coins -= 10; player.ammo += 5; openShop(); }
}

function buyHeart() {
    if (coins >= 25 && player.hearts < player.maxHearts) { coins -= 25; player.hearts++; openShop(); }
}

function upgradeSpeed() {
    if (coins >= 50) { coins -= 50; player.speed += 0.5; openShop(); }
}

function openSettings() { document.getElementById('settingsMenu').classList.remove('hidden'); }
function closeOverlay(id) { document.getElementById(id).classList.add('hidden'); }
function showMainMenu() {
    document.getElementById('winMenu').classList.add('hidden');
    document.getElementById('mainMenu').classList.remove('hidden');
    toggleTorch(false);
}

function updateSettings() {
    gameConfig.brightness = document.getElementById('brightnessSlider').value / 100;
    gameConfig.theme = document.getElementById('themeSelect').value;
    gameConfig.vibrationEnabled = document.getElementById('vibeToggle').checked;
}

// أدوات التحكم باللمس واللوحة
document.getElementById('btnLeft').ontouchstart = (e) => { e.preventDefault(); keys.left = true; };
document.getElementById('btnLeft').ontouchend = (e) => { e.preventDefault(); keys.left = false; };
document.getElementById('btnRight').ontouchstart = (e) => { e.preventDefault(); keys.right = true; };
document.getElementById('btnRight').ontouchend = (e) => { e.preventDefault(); keys.right = false; };
document.getElementById('btnJump').ontouchstart = (e) => { e.preventDefault(); keys.up = true; };
document.getElementById('btnJump').ontouchend = (e) => { e.preventDefault(); keys.up = false; };
document.getElementById('btnShoot').onclick = () => shoot();

window.onkeydown = e => {
    if (e.key === 'ArrowLeft') keys.left = true;
    if (e.key === 'ArrowRight') keys.right = true;
    if (e.key === 'ArrowUp') keys.up = true;
    if (e.key === ' ') shoot();
};
window.onkeyup = e => {
    if (e.key === 'ArrowLeft') keys.left = false;
    if (e.key === 'ArrowRight') keys.right = false;
    if (e.key === 'ArrowUp') keys.up = false;
};
