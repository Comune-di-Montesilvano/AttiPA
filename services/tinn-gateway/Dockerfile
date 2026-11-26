# Firebird 5 embedded (librerie dall'immagine ufficiale) + Python: ripristina il backup
# Tinn con gbak e lo espone in sola lettura sulla rete interna. Nessun server Firebird
# in ascolto: gbak e firebird-driver lavorano direttamente sul file.
FROM firebirdsql/firebird:5.0.3@sha256:42d7c1adf524236bdb57ba12dcbe6a9d8b2aaea4948fe93cbc2b5ad5d06f5798 AS firebird

FROM python:3.15-slim@sha256:65a65fc7b30b06cb6df4930fd4650697cb23f4c2698ab81fc87e4b031bc36928
WORKDIR /svc
# PKG_REFRESH (data del giorno, da release.yml) invalida una volta al giorno il layer
# `apt-get upgrade`, altrimenti la cache registry congela le patch Debian.
ARG PKG_REFRESH=none
# libtommath/libtomcrypt: dipendenze di libfbclient e gbak; libicu: collation di Firebird.
RUN apt-get update && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends libtommath1 libtomcrypt1 libicu76 tzdata \
    && rm -rf /var/lib/apt/lists/*
COPY --from=firebird /opt/firebird /opt/firebird
# firebird.log nella cartella di installazione: con filesystem in sola lettura va su tmpfs.
RUN ln -sf /tmp/firebird.log /opt/firebird/firebird.log
COPY services/tinn-gateway/requirements.txt .
# Lock completo con hash (pip-compile); pip rimosso dopo l'install con le sue librerie vendored.
RUN pip install --no-cache-dir --require-hashes --no-deps -r requirements.txt \
    && (pip uninstall -y pip setuptools wheel || true)
COPY services/tinn-gateway/app/ ./app/
COPY services/tinn-gateway/queries/ ./queries/
RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin tinn \
    && mkdir -p /data && chown tinn /data
ENV FIREBIRD=/opt/firebird FB_BIN=/opt/firebird/bin FIREBIRD_LOCK=/data/lock FIREBIRD_TMP=/tmp \
    TINN_DATA=/data PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 TZ=Europe/Rome
USER 10001
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
