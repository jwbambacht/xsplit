import {sign, deriveKeypair} from 'ripple-keypairs';

async function doLoginAction(event: Event): Promise<void> {
    event.preventDefault();
    const userName = $("#userName").val();
    const secretStr = $("#secret").val().toString().trim();

    let derivationResult = null;
    try {
        derivationResult = deriveKeypair(secretStr)
    } catch (e) {
        console.error(e);
        $("#parseError").removeClass("d-none");
        return;
    }

    console.log("Form submitted!");

    let resp = await fetch("/api/login/challenge?username=" + userName);
    if (resp.status !== 200) {
        if (resp.status === 400) {
            $("#invalidFields").removeClass("d-none");
        } else {
            console.warn("Got " + resp.status + " instead of 200");
        }
        return;
    }

    const challenge = await resp.text();

    const result = sign(challenge, derivationResult.privateKey);

    const bearerStr = "Bearer " + window.btoa(userName + ":" + result);
    resp = await fetch("/api/login/validate", {
        headers: {
            'Authorization': bearerStr
        }
    });
    if (resp.status !== 200) {
        if (resp.status == 401) {
            $("#invalidFields").removeClass("d-none");
        }
        console.warn("Got " + resp.status + " instead of 200");
        return
    }
    console.log("Login success!");

    sessionStorage.setItem("secret", secretStr);
    sessionStorage.setItem("bearer", bearerStr);
    document.location.href="/"
}

function onLoginPageLoad(): void {
    jQuery(($) => {
        $("#loginForm").on("submit", doLoginAction);

    });
}

document.addEventListener("DOMContentLoaded", onLoginPageLoad);
