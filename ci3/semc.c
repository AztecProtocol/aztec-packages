#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <semaphore.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <signal.h>
#include <stdarg.h>

#define MAX_NAME_LEN 255  // Maximum length for semaphore name

volatile sig_atomic_t termination_requested = 0;

static int verbose = 0;

// Signal handler to set the term flag.
void handle_signal(int signum) {
    termination_requested = 1;
}

void usage(const char *prog_name) {
    fprintf(stderr, "Usage: %s [-v] [--atomic] --name /sem_name [--init N] [+N|-N] [--cleanup]\n", prog_name);
    fprintf(stderr, "  -v               : Enable verbose output (to stderr)\n");
    fprintf(stderr, "  --atomic         : Use atomic_wait approach (with rollback on signal) for decrementing\n");
    fprintf(stderr, "  --name /sem_name : Specify the semaphore name (must start with /)\n");
    fprintf(stderr, "  --init N         : Initialize semaphore with value N\n");
    fprintf(stderr, "  +N or -N         : Increment or decrement by N\n");
    fprintf(stderr, "  --cleanup        : Remove the semaphore and exit\n");
    exit(EXIT_FAILURE);
}

// printf-like function for -v mode.
void vprintf_verbose(const char *fmt, ...) {
    if (!verbose)
        return;
    va_list args;
    va_start(args, fmt);
    vfprintf(stderr, fmt, args);
    va_end(args);
}

sem_t *init_semaphore(const char *name, int initial_value) {
    sem_t *sem;
    // Force reset if semaphore exists.
    sem_unlink(name);  // ...ignore errors...

    // Create a new semaphore with the initial value.
    sem = sem_open(name, O_CREAT | O_EXCL, 0644, initial_value);
    if (sem == SEM_FAILED) {
        perror("sem_open (create)");
        exit(EXIT_FAILURE);
    }
    vprintf_verbose("Initialized semaphore %s with value %d\n", name, initial_value);
    return sem;
}

void cleanup_semaphore(const char *name) {
    if (sem_unlink(name) == -1) {
        perror("sem_unlink");
        exit(EXIT_FAILURE);
    }
    vprintf_verbose("Cleaned up semaphore %s\n", name);
}

int get_sem_value(sem_t *sem) {
    int value;
    if (sem_getvalue(sem, &value) == -1) {
        perror("sem_getvalue");
        exit(EXIT_FAILURE);
    }
    return value;
}

// Atomically wait for N resources.
// We maybe starved out by other consumers consuming with much smaller n.
void atomic_wait(sem_t *sem, int n) {
    int acquired, i;
    while (1) {
        if (termination_requested) {
            vprintf_verbose("Termination signal received during atomic_wait, rolling back.\n");
            exit(EXIT_FAILURE);
        }
        acquired = 0;
        for (i = 0; i < n; i++) {
            if (sem_trywait(sem) == -1)
                break;
            acquired++;
        }
        if (acquired == n) {
            return;
        } else {
            // Rollback any acquired resources
            for (i = 0; i < acquired; i++) {
                sem_post(sem);
            }
            usleep(1000); // Sleep briefly before retrying
        }
    }
}

int main(int argc, char *argv[]) {
    const char *sem_name = NULL;
    int init_value = -1;  // -1 means no initialization
    int amount = 0;
    int cleanup = 0;
    int has_amount = 0;
    int use_atomic_decrement = 0;

    // Install signal handlers.
    signal(SIGINT, handle_signal);
    signal(SIGTERM, handle_signal);

    // Parse command-line arguments.
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "-v") == 0) {
            verbose = 1;
            continue;
        }
        if (strcmp(argv[i], "--atomic") == 0) {
            use_atomic_decrement = 1;
            continue;
        }
        if (strcmp(argv[i], "--name") == 0) {
            if (++i >= argc) usage(argv[0]);
            sem_name = argv[i];
            if (sem_name[0] != '/') {
                fprintf(stderr, "Semaphore name must start with /\n");
                exit(EXIT_FAILURE);
            }
            if (strlen(sem_name) > MAX_NAME_LEN) {
                fprintf(stderr, "Semaphore name too long\n");
                exit(EXIT_FAILURE);
            }
        } else if (strcmp(argv[i], "--init") == 0) {
            if (++i >= argc) usage(argv[0]);
            init_value = atoi(argv[i]);
            if (init_value < 0) {
                fprintf(stderr, "Initial value must be non-negative\n");
                exit(EXIT_FAILURE);
            }
        } else if (strcmp(argv[i], "--cleanup") == 0) {
            cleanup = 1;
        } else if (argv[i][0] == '+' || argv[i][0] == '-') {
            amount = atoi(argv[i]);
            has_amount = 1;
        } else {
            usage(argv[0]);
        }
    }

    // Validate required arguments
    if (!sem_name) {
        fprintf(stderr, "Semaphore name required (--name)\n");
        usage(argv[0]);
    }

    // Handle cleanup
    if (cleanup) {
        cleanup_semaphore(sem_name);
        return 0;
    }

    // Initialize or connect to the semaphore
    sem_t *sem = (init_value >= 0) ? init_semaphore(sem_name, init_value) : sem_open(sem_name, O_CREAT);
    if (sem == SEM_FAILED) {
        perror("sem_open");
        exit(EXIT_FAILURE);
    }

    // Show current value
    vprintf_verbose("Current semaphore value: %d\n", get_sem_value(sem));

    // If no amount specified, exit.
    if (!has_amount) {
        sem_close(sem);
        return 0;
    }

    // Perform increment or decrement
    if (amount >= 0) {
        for (int i = 0; i < amount; i++) {
            if (sem_post(sem) == -1) {
                perror("sem_post");
                exit(EXIT_FAILURE);
            }
        }
        vprintf_verbose("Incremented by %d, new value: %d\n", amount, get_sem_value(sem));
    } else {
        amount = -amount;  // Make positive value for decrement
        if (use_atomic_decrement) {
            vprintf_verbose("Using atomic_wait for decrement by %d...\n", amount);
            atomic_wait(sem, amount);
        } else {
            vprintf_verbose("Using non-atomic sem_wait for decrement by %d...\n", amount);
            int succeeded = 0;
            for (int i = 0; i < amount; i++) {
                if (termination_requested) {
                    break;
                }
                if (sem_wait(sem) == -1) {
                    if (errno == EINTR) {
                        break;
                    } else {
                        perror("sem_wait");
                        exit(EXIT_FAILURE);
                    }
                }
                succeeded++;
            }
            if (succeeded != amount) {
                vprintf_verbose("Failed to decrement by %d, only succeeded in acquiring %d\n", amount, succeeded);
                for (int j = 0; j < succeeded; j++) {
                    sem_post(sem);
                }
                exit(EXIT_FAILURE);
            }
        }
        vprintf_verbose("Decremented by %d, new value: %d\n", amount, get_sem_value(sem));
    }

    // Close the semaphore handle (does not remove it)
    if (sem_close(sem) == -1) {
        perror("sem_close");
        exit(EXIT_FAILURE);
    }

    return 0;
}
