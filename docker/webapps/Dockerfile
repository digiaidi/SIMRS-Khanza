FROM php:7.4-apache

# Install required packages and PHP extensions
RUN apt-get update && apt-get install -y \
    libpng-dev \
    libjpeg-dev \
    libfreetype6-dev \
    libzip-dev \
    zip \
    unzip \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j$(nproc) gd mysqli pdo_mysql zip

# Enable Apache mod_rewrite
RUN a2enmod rewrite

# Copy custom php.ini configuration
COPY php.ini /usr/local/etc/php/

# Set working directory
WORKDIR /var/www/html
