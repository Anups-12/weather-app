// 📌 Register Function
async function register() {
    const username = document.getElementById("reg-username").value;
    const email = document.getElementById("reg-email").value;
    const password = document.getElementById("reg-password").value;

    const responseElement = document.getElementById("response");

    if (!username || !email || !password) {
        responseElement.textContent = "Please fill all fields.";
        responseElement.style.color = "red";
        return;
    }

    const user = { username, email, password };

    try {
        const response = await fetch("/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(user),
        });

        const data = await response.json();
        if (response.ok) {
            responseElement.textContent = data.message;
            responseElement.style.color = "green";
        } else {
            responseElement.textContent = data.message;
            responseElement.style.color = "red";
        }
    } catch (error) {
        responseElement.textContent = "Error during registration.";
        responseElement.style.color = "red";
    }
}

// 📌 Login Function with Dashboard Redirection
async function login() {
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;

    const responseElement = document.getElementById("response");

    if (!email || !password) {
        responseElement.textContent = "Please fill all fields.";
        responseElement.style.color = "red";
        return;
    }

    const credentials = { email, password };

    try {
        const response = await fetch("/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(credentials),
        });

        const data = await response.json();
        if (response.ok) {
            responseElement.textContent = data.message;
            responseElement.style.color = "green";

            // ✅ Redirect to dashboard after successful login
            setTimeout(() => {
                window.location.href = "dashboard.html";
            }, 1000);  // Redirect after 1 second
        } else {
            responseElement.textContent = data.message;
            responseElement.style.color = "red";
        }
    } catch (error) {
        responseElement.textContent = "Error during login.";
        responseElement.style.color = "red";
    }
}
