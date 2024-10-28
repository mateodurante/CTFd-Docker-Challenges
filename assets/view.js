CTFd._internal.challenge.data = undefined;

CTFd._internal.challenge.preRender = function () {};

CTFd._internal.challenge.postRender = function () {};

CTFd._internal.challenge.submit = function (preview) {
  var challenge_id = parseInt(CTFd.lib.$("#challenge-id").val());
  var submission = CTFd.lib.$("#challenge-input").val();

  var body = {
    challenge_id: challenge_id,
    submission: submission,
  };
  var params = {};
  if (preview) {
    params["preview"] = true;
  }

  return CTFd.api
    .post_challenge_attempt(params, body)
    .then(function (response) {
      if (response.status === 429) {
        // User was ratelimited but process response
        return response;
      }
      if (response.status === 403) {
        // User is not logged in or CTF is paused.
        return response;
      }
      return response;
    });
};

var captchaResponse1 = null;
var captchaResponse2 = null;

function loadRecaptcha() {
  if (document.getElementById("recaptcha-container1").innerHTML !== "") {
    return;
  }
  const sitekey = document
    .getElementById("docker_container")
    .getAttribute("sitekey");
  grecaptcha.render(document.getElementById("recaptcha-container1"), {
    sitekey: sitekey,
    callback: (response) => {
      captchaResponse1 = response;
    },
    theme: "dark",
  });
}

function reloadRecaptcha() {
  if (document.getElementById("recaptcha-container2").innerHTML !== "") {
    return;
  }
  grecaptcha.render(document.getElementById("recaptcha-container2"), {
    sitekey: document
      .getElementById("docker_container")
      .getAttribute("sitekey"),
    callback: (response) => {
      captchaResponse2 = response;
    },
    theme: "dark",
  });
}

function get_docker_status(container, challenge_id) {
  // Realiza una solicitud GET con Fetch API
  fetch("/api/v1/docker_status")
    .then((response) => response.json())
    .then((result) => {
      result.data.forEach((item) => {
        if (
          item.challenge_id == challenge_id
          // && item.docker_image == container // No es necesario comprobar la imagen si los challenge_id son únicos
        ) {
          var ports = String(item.ports).split(",");
          var data = "";
          ports.forEach((port) => {
            port = String(port);
            data += "Host: " + item.host + "<br />Port: " + port + "<br />";
          });

          // Actualiza el contenido del contenedor 'docker_container'
          var dockerContainer = document.getElementById("docker_container");
          dockerContainer.innerHTML =
            "<pre>Docker Container Information:<br />" +
            data +
            '<div class="mt-2" id="' +
            String(item.instance_id).substring(0, 10) +
            '_revert_container"></div>';

          // Configura el temporizador de cuenta regresiva
          var countDownDate = new Date(
            parseInt(item.revert_time) * 1000
          ).getTime();
          var x = setInterval(function () {
            var now = new Date().getTime();
            var distance = countDownDate - now;
            var minutes = Math.floor(
              (distance % (1000 * 60 * 60)) / (1000 * 60)
            );
            var seconds = Math.floor((distance % (1000 * 60)) / 1000);
            if (seconds < 10) {
              seconds = "0" + seconds;
            }

            var revertContainer = document.getElementById(
              String(item.instance_id).substring(0, 10) + "_revert_container"
            );

            if (revertContainer) {
              revertContainer.innerHTML =
                "Container Reset Available in " + minutes + ":" + seconds;
            }

            // Si el tiempo ha terminado, detén el temporizador y muestra el botón para revertir
            if (distance <= 0) {
              clearInterval(x);
              if (revertContainer) {
                const sitekey = dockerContainer.getAttribute("sitekey");
                revertContainer.innerHTML =
                  '<div style="align-items: center; display: flex; justify-content: center;"> <div id="recaptcha-container2" x-ref="recaptchaContainer2" sitekey="' +
                  sitekey +
                  '"></div> </div>' +
                  "<a onclick=\"start_container('" +
                  "" +
                  "','" +
                  challenge_id +
                  "','','2');\" class='btn btn-dark'><small style='color:white;'><i class=\"fas fa-redo\"></i> Reset</small></a>";
                reloadRecaptcha();
              }
            }
          }, 1000);

          return false; // Termina la iteración del forEach
        }
      });
    })
    .catch((error) => {
      console.error("Error en la solicitud:", error);
    });
}

function start_container(
  container,
  challenge_id,
  recaptchaResponse,
  captcha = "1"
) {
  // Check if reCAPTCHA was completed
  if (!recaptchaResponse) {
    if (captcha === "1") {
      recaptchaResponse = captchaResponse1;
    } else {
      recaptchaResponse = captchaResponse2;
    }
    if (!recaptchaResponse) {
      alert("Please, complete the reCAPTCHA verification first.");
      return;
    }
  }

  CTFd.lib
    .$("#docker_container")
    .html(
      '<div class="text-center"><i class="fas fa-circle-notch fa-spin fa-1x"></i></div>'
    );

  fetch(`/api/v1/container?id=${challenge_id}&recaptcha=${recaptchaResponse}`)
    .then((response) => {
      if (response.status === 403) {
        throw new Error("recaptcha");
      }
      if (!response.ok) {
        throw new Error("time");
      }
      return response.json();
    })
    .then((result) => {
      get_docker_status(container, challenge_id);
    })
    .catch((error) => {
      if (error.message === "recaptcha") {
        alert("Please complete the reCAPTCHA verification first.");
      } else if (error.message === "time") {
        alert(
          "You can only reset a container once per 5 minutes! Please be patient."
        );
        // ezal({
        //   title: "Error!",
        //   body: error,
        //   button: "Got it!",
        // });
      }
      console.error("Error en la solicitud:", error);
    });
}

function ezal(args) {
  var res =
    '<div class="modal fade" tabindex="-1" role="dialog">' +
    '  <div class="modal-dialog" role="document">' +
    '    <div class="modal-content" style="background-color: rgba(0, 0, 0, 0.9); color: white;">' +
    '      <div class="modal-header">' +
    `        <h5 class="modal-title">${args.title}</h5>` +
    '        <button type="button" data-dismiss="modal" aria-label="Close"  class="close btn-close" aria-label="Close">' +
    "        </button>" +
    "      </div>" +
    '      <div class="modal-body">' +
    `        <p>${args.body}</p>` +
    "      </div>" +
    '      <div class="modal-footer">' +
    "      </div>" +
    "    </div>" +
    "  </div>" +
    "</div>";

  // Convertir la cadena de HTML en un elemento DOM
  var template = document.createElement("div");
  template.innerHTML = res;
  var modalElement = template.firstElementChild;

  // Agregar el botón en el footer
  var button = document.createElement("button");
  button.type = "button";
  button.className = "btn btn-primary";
  button.setAttribute("data-dismiss", "modal");
  button.textContent = args.button || "Close";
  button.onclick = function () {
    modalElement.classList.remove("show");
    modalElement.style.display = "none";
    modalElement.remove(); // Eliminar el modal del DOM
  };
  modalElement.querySelector(".modal-footer").appendChild(button);

  // Añadir el modal al DOM
  document.querySelector("main").appendChild(modalElement);

  // Mostrar el modal (agregar clases necesarias)
  modalElement.classList.add("show");
  modalElement.style.display = "block";

  // Cerrar el modal al hacer clic en el botón de cerrar o en el botón del footer
  modalElement
    .querySelector("[data-dismiss='modal']")
    .addEventListener("click", function () {
      modalElement.classList.remove("show");
      modalElement.style.display = "none";
      modalElement.remove(); // Eliminar el modal del DOM
    });

  return modalElement;
}
