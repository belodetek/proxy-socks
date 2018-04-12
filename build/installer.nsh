!macro customInstall
  ExecWait 'netsh.exe advfirewall firewall add rule name=${PRODUCT_FILENAME} dir=in \
    action=allow program="$INSTDIR\${APP_EXECUTABLE_FILENAME}" \
    enable=yes profile=public,private'
!macroend

!macro customUnInstall
  ExecWait 'netsh.exe advfirewall firewall delete rule name=${PRODUCT_FILENAME}'
!macroend
