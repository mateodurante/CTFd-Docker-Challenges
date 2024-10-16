CTFd._internal.challenge.data = undefined;

// CTFd._internal.challenge.renderer = CTFd.lib.markdown();

CTFd._internal.challenge.preRender = function () {};

CTFd._internal.challenge.render = function (markdown) {
  return markdown;
};

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

function get_docker_status(container, challenge_id) {
  // Realiza una solicitud GET con Fetch API
  fetch("/api/v1/docker_status")
    .then((response) => response.json())
    .then((result) => {
      result.data.forEach((item) => {
        if (
          item.challenge_id == challenge_id &&
          item.docker_image == container
        ) {
          var ports = String(item.ports).split(",");
          var data = "";
          ports.forEach((port) => {
            port = String(port);
            data += "Host: " + item.host + " Port: " + port + "<br />";
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
                "Next Revert Available in " + minutes + ":" + seconds;
            }

            // Si el tiempo ha terminado, detén el temporizador y muestra el botón para revertir
            if (distance < 0) {
              clearInterval(x);
              if (revertContainer) {
                revertContainer.innerHTML =
                  "<a onclick=\"start_container('" +
                  container +
                  "','" +
                  challenge_id +
                  "');\" class='btn btn-dark'><small style='color:white;'><i class=\"fas fa-redo\"></i> Revert</small></a>";
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

function start_container(container, challenge_id) {
  CTFd.lib
    .$("#docker_container")
    .html(
      '<div class="text-center"><i class="fas fa-circle-notch fa-spin fa-1x"></i></div>'
    );

  fetch(`/api/v1/container?id=${challenge_id}`)
    .then((response) => {
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    })
    .then((result) => {
      get_docker_status(container, challenge_id);
    })
    .catch((error) => {
      ezal({
        title: "Attention!",
        body: "You can only revert a container once per 5 minutes! Please be patient.",
        button: "Got it!",
      });
      console.error("Error en la solicitud:", error);
    });
}

function ezal(args) {
  var res =
    '<div class="modal fade" tabindex="-1" role="dialog">' +
    '  <div class="modal-dialog" role="document">' +
    '    <div class="modal-content">' +
    '      <div class="modal-header">' +
    `        <h5 class="modal-title">${args.title}</h5>` +
    '        <button type="button" class="close" data-dismiss="modal" aria-label="Close">' +
    '          <span aria-hidden="true">&times;</span>' +
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
