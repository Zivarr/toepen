FROM php:8.4-apache
RUN apt-get update && apt-get install -y --no-install-recommends unzip git \
    && rm -rf /var/lib/apt/lists/*
RUN docker-php-ext-install pdo_mysql && a2enmod rewrite
RUN printf '<Directory /var/www/html>\n    AllowOverride All\n</Directory>\n' > /etc/apache2/conf-available/allow-override.conf \
    && a2enconf allow-override
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
