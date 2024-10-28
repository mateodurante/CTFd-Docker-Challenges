import os
import tempfile
import traceback

from flask import Blueprint, render_template, request, jsonify
from sqlalchemy.exc import InternalError

from CTFd.api import CTFd_API_v1
from CTFd.models import Teams, Users, db
from CTFd.plugins import register_plugin_assets_directory
from CTFd.plugins.challenges import CHALLENGE_CLASSES
from CTFd.utils.config import is_teams_mode
from CTFd.utils.decorators import admins_only
from CTFd.utils.plugins import register_script

from .api import (
    active_docker_namespace,
    container_namespace,
    docker_namespace,
    kill_container,
    secret_namespace,
)
from .functions.general import get_repositories, get_docker_info, do_request
from .models.container import DockerChallengeType
from .models.models import DockerChallengeTracker, DockerConfig, DockerConfigForm
from .models.service import DockerServiceChallengeType
from .functions.recaptcha import ReCaptcha


def __handle_file_upload(file_key, docker, attr_name):
    if file_key not in request.files:
        setattr(docker, attr_name, "")
        return

    try:
        file_content = request.files[file_key].stream.read()
        if len(file_content) != 0:
            tmp_file = tempfile.NamedTemporaryFile(mode="wb", dir="/tmp", delete=False)
            tmp_file.write(file_content)
            tmp_file.seek(0)
            setattr(docker, attr_name, tmp_file.name)
            return
    except Exception as err:
        print(err)

    setattr(docker, attr_name, "")


def define_docker_admin(app):
    admin_docker_config = Blueprint(
        "admin_docker_config",
        __name__,
        template_folder="templates",
        static_folder="assets",
    )

    @admin_docker_config.route("/admin/docker_config", methods=["GET", "POST"])
    @admins_only
    def docker_config():
        docker = DockerConfig.query.filter_by(id=1).first()
        form = DockerConfigForm()

        if not docker:
            print("No docker config was found, setting empty one.")
            docker = DockerConfig()
            db.session.add(docker)
            db.session.commit()
            docker = DockerConfig.query.filter_by(id=1).first()

        if request.method == "POST":
            docker.hostname = request.form["hostname"]

            docker.public_hostname = request.form.get(
                "public_hostname", docker.hostname.split(":")[0]
            )

            docker.tls_enabled = False
            if "tls_enabled" in request.form:
                docker.tls_enabled = request.form["tls_enabled"] == "True"

            if docker.tls_enabled:
                # __handle_file_upload("ca_cert", docker, "ca_cert")
                # __handle_file_upload("client_cert", docker, "client_cert")
                # __handle_file_upload("client_key", docker, "client_key")
                docker.ca_cert = request.form["ca_cert"]
                docker.client_cert = request.form["client_cert"]
                docker.client_key = request.form["client_key"]
            else:
                docker.ca_cert = None
                docker.client_cert = None
                docker.client_key = None

            repositories = request.form.to_dict(flat=False).get("repositories", None)
            if repositories:
                docker.repositories = ",".join(repositories)
            else:
                docker.repositories = None

            db.session.add(docker)
            db.session.commit()
            docker = DockerConfig.query.filter_by(id=1).first()

        try:
            repos = get_repositories(docker)
        except:
            print(traceback.print_exc())
            repos = list()

        if len(repos) == 0:
            form.repositories.choices = [("ERROR", "Failed to load repositories")]
        else:
            form.repositories.choices = [(d, d) for d in repos]

        # dconfig = DockerConfig.query.filter_by(id=1).first()
        try:
            selected_repos = docker.repositories
            if selected_repos == None:
                selected_repos = list()
        except:
            print(traceback.print_exc())
            selected_repos = []

        dinfo = get_docker_info(docker)

        return render_template(
            "docker_config.html",
            config=docker,
            form=form,
            repos=selected_repos,
            info=dinfo,
        )

    app.register_blueprint(admin_docker_config)


def define_docker_status(app):
    admin_docker_status = Blueprint(
        "admin_docker_status",
        __name__,
        template_folder="templates",
        static_folder="assets",
    )

    @admin_docker_status.route("/admin/docker_status", methods=["GET", "POST"])
    @admins_only
    def docker_admin():
        try:
            docker_tracker = DockerChallengeTracker.query.all()
            for i in docker_tracker:
                if is_teams_mode():
                    name = Teams.query.filter_by(id=i.team_id).first()
                    i.team_id = name.name
                else:
                    name = Users.query.filter_by(id=i.user_id).first()
                    i.user_id = name.name
        except InternalError as err:
            print(err)
            return render_template("admin_docker_status.html", dockers=[])

        return render_template("admin_docker_status.html", dockers=docker_tracker)

    app.register_blueprint(admin_docker_status)


def load(app):
    app.db.create_all()

    site_key = os.getenv("RECAPTCHA_SITE_KEY", "")
    secret_key = os.getenv("RECAPTCHA_SECRET_KEY", "")
    app.config["CHALLENGE_RECAPTCHA"] = ReCaptcha(
        site_key=site_key,
        secret_key=secret_key,
        is_enabled=site_key != "" and secret_key != "",
    )
    register_script("//www.google.com/recaptcha/api.js?hl=en&render=explicit")
    app.jinja_env.globals.update(recaptcha_site_key=site_key)

    app.config["DOCKER_RESET_SECONDS"] = int(os.getenv("DOCKER_RESET_SECONDS", 5 * 60))
    app.config["DOCKER_STALE_SECONDS"] = int(
        os.getenv("DOCKER_STALE_SECONDS", 120 * 60)
    )

    CHALLENGE_CLASSES["docker"] = DockerChallengeType
    CHALLENGE_CLASSES["docker_service"] = DockerServiceChallengeType

    register_plugin_assets_directory(app, base_path="/plugins/docker_challenges/assets")

    define_docker_admin(app)
    define_docker_status(app)

    CTFd_API_v1.add_namespace(docker_namespace, "/docker")
    CTFd_API_v1.add_namespace(container_namespace, "/container")
    CTFd_API_v1.add_namespace(active_docker_namespace, "/docker_status")
    CTFd_API_v1.add_namespace(kill_container, "/nuke")
    CTFd_API_v1.add_namespace(secret_namespace, "/secret")
