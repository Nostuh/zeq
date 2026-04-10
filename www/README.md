# NCI Server / KI Setup / Misc


## Requirements

1.  MariaDB (Mysql)
2.  Nginx
3.  NVM

## Directories

1.  /srv -- all things hosted under this path
2.  /srv/images -- all images related to any website
3.  /srv/scripts -- automation scripts, sync scripts, etc
4.  /srv/www -- webserver directories for front end/back ends
5.  /srv/logs -- logs location setup in nginx
6.  /srv/cron -- anything configured cron jobs via crontab -e

## 

## SSH Key Setup / Information

The below sets you up to be able to add your ssh key to our three servers in rackspace and sets your user up to connect to github with an ssh key.

1.  ssh-keygen -t ed25519 -C "your_email_here@karran.com"
2.  chmod 600 ~/.ssh/id_ed25519
3.  create file at ~/.ssh/config
    - Put the following as contents:
        ```
        Host github.com
        HostName github.com
        IdentityFile ~/.ssh/id_ed25519
        ```
4.  chmod 600 ~/.ssh/config

On a recieving server, for example stg.karran.com, a user's home folder will be at /home/user. For me, it would be /home/dhutson
You can create a folder called .ssh with 700 permissions, then inside of that folder create a file called 'authorized_keys' with 700 permissions.
You copy the contents of your ed25519.pub file into authorized_keys and the next login if you are using a private key, it auto logs you in.
Which looks a little like ssh-ed25519 xyz....(about 80 characters) dhutson@dev-server

Helpful link:  https://www.digitalocean.com/community/tutorials/how-to-set-up-ssh-keys-on-ubuntu-20-04


## PM2 (Daemon Process Manager for NodeJS)

The server has a username called 'pm2' added to the server which then is responsible for running any and all 'pm2' commands -- one is a username, the other is a command within the username. Currently you would need an account added to the linux box, and as root you would need to visudo to add the account name to give quick access to the user pm2.

1.  Login as root
2.  Type: visudo
3.  Add an entry like the below.

    Example:
    ```
    <newaccount> ALL=(pm2)NOPASSWD : ALL
    ```

### Commands commands

1.  pm2 list -- list all processes configured
2.  pm2 logs -- tail all logs being thrown by all processes
3.  pm2 logs <process_id> -- tail logs of single process
4.  pm2 monit -- pm2 screen that shows each process and has it's own gui
5.  pm2 save -- save current STATE of the process list to turn on after a reboot
6.  pm2 startup -- (only ever needs configured once) -- gives command for root to add pm2 to startup after a reboot
7.  pm2 start "filename.js" --name "some processname" -- starts and adds the process to pm2 list -- need to be at the directory
8.  pm2 delete <process_id> -- deletes process off process list via pm2 list

## Install NVM/NPM/PM2 to a user

1.  Login to server
2.  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
3.  nvm install 20.11.0 -- last part can be the version you desire
4.  nvm use 20.11.0 -- how to change between versions
5.  npm install pm2 -g -- global install to nvm version, if you change versions pm2 will disappear


usermod -aG stuff
nginx stuff


ki_images vs ki_for_website

