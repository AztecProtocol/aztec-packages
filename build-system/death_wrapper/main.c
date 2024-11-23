#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <fcntl.h>

int main(int argc, char *argv[]) {
    if (argc < 2) {
        fprintf(stderr, "Usage: %s <command> [args...]\n", argv[0]);
        return 1;
    }

    pid_t pid = fork();
    if (pid < 0) {
        perror("fork failed");
        return 1;
    }

    if (pid == 0) {
        // In child process

        // Close standard file descriptors and reopen them to /dev/null
        int devnull = open("/dev/null", O_RDWR);
        if (devnull >= 0) {
            dup2(devnull, STDIN_FILENO);
            dup2(devnull, STDOUT_FILENO);
            dup2(devnull, STDERR_FILENO);
            if (devnull > 2) {
                close(devnull);
            }
        }

        // Create new process group
        if (setpgid(0, 0) < 0) {
            perror("setpgid failed");
            exit(1);
        }

        // Explicitly detach from controlling terminal
        if (setsid() < 0) {
            perror("setsid failed");
            // Continue anyway as this might fail if already process group leader
        }

        // Set as non-interactive
        setenv("DEBIAN_FRONTEND", "noninteractive", 1);

        execvp(argv[1], &argv[1]);
        perror("execvp failed");
        exit(1);
    }

    // Parent process
    int status;
    waitpid(pid, &status, 0);

    // Clean up child process group
    if (pid > 0) {
        kill(-pid, SIGKILL);
    }

    return WEXITSTATUS(status);
}