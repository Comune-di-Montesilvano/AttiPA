# LibreOffice headless per la conversione dei documenti (RTF/DOCX/ODT → PDF...).
FROM python:3.15-slim@sha256:65a65fc7b30b06cb6df4930fd4650697cb23f4c2698ab81fc87e4b031bc36928
WORKDIR /svc
# PKG_REFRESH (data del giorno, da release.yml) invalida una volta al giorno il layer
# `apt-get upgrade`, altrimenti la cache registry congela le patch Debian.
ARG PKG_REFRESH=none
RUN apt-get update && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends libreoffice-writer-nogui fonts-dejavu fonts-liberation2 tzdata \
    && rm -rf /var/lib/apt/lists/*
COPY services/docgen/requirements.txt .
# Lock completo con hash (pip-compile); pip rimosso dopo l'install con le sue librerie vendored.
RUN pip install --no-cache-dir --require-hashes --no-deps -r requirements.txt \
    && (pip uninstall -y pip setuptools wheel || true)
COPY services/docgen/app/ ./app/
# Utente senza privilegi: un documento ostile che sfrutta un bug di LibreOffice non ottiene root.
RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin docgen
# HOME su tmpfs: LibreOffice scrive cache e profilo anche fuori da UserInstallation.
ENV HOME=/tmp PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 TZ=Europe/Rome
USER 10001
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
